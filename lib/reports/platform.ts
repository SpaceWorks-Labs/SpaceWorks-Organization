import "server-only";

import { OrganisationStatus, OutboxStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { median } from "./dataset";
import { ROLLUP_HEARTBEAT_KEY } from "./rollup";
import { OUTBOX_SCHEDULER_HEARTBEAT_KEY } from "@/lib/operationalHeartbeat";

const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The last calendar day of each of the last `count` months (UTC dates, as the rollup stores days), oldest first; the current month ends today. */
function monthEnds(now: Date, count = 12): Array<{ day: Date; label: string }> {
  const out: Array<{ day: Date; label: string }> = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back + 1, 0));
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = end > today ? today : end;
    out.push({ day, label: `${MONTHS[day.getUTCMonth()]} ${String(day.getUTCFullYear()).slice(2)}` });
  }
  return out;
}

/** A1: organisations by status, decisions in the window, and how long review takes. */
export async function tenantPipeline(window: { from: Date; to: Date }) {
  const [byStatus, reviews, waiting] = await Promise.all([
    prisma.organisation.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.organisationReview.findMany({ where: { createdAt: { gte: new Date(window.from.getTime() - 120 * DAY), lt: window.to } }, orderBy: { createdAt: "asc" }, select: { organisationId: true, action: true, createdAt: true } }),
    prisma.organisation.findMany({ where: { status: { in: [OrganisationStatus.PENDING_REVIEW, OrganisationStatus.CHANGES_REQUESTED] } }, orderBy: { updatedAt: "asc" }, take: 10, select: { id: true, name: true, status: true, updatedAt: true } }),
  ]);
  const count = (action: string) => reviews.filter((review) => review.action === action && review.createdAt >= window.from).length;
  const submitted = new Map<string, Date>();
  const hours: number[] = [];
  for (const review of reviews) {
    if ((review.action === "SUBMITTED" || review.action === "RESUBMITTED") && !submitted.has(review.organisationId)) submitted.set(review.organisationId, review.createdAt);
    if (review.action === "APPROVED" && review.createdAt >= window.from) {
      const start = submitted.get(review.organisationId);
      if (start) hours.push((review.createdAt.getTime() - start.getTime()) / 3_600_000);
    }
  }
  return {
    byStatus: Object.values(OrganisationStatus).map((status) => ({ status, count: byStatus.find((row) => row.status === status)?._count._all ?? 0 })),
    submitted: count("SUBMITTED") + count("RESUBMITTED"),
    created: count("CREATED"),
    approved: count("APPROVED"),
    rejected: count("REJECTED"),
    changesRequested: count("CHANGES_REQUESTED"),
    medianHoursToApprove: median(hours),
    waiting,
  };
}

/** A2 and A3 from the rollup: organisations with active members, and members across organisations, at each month end. */
export async function rollupAcrossTenants(now: Date) {
  const ends = monthEnds(now, 12);
  const rows = await prisma.orgDailyStats.findMany({ where: { planId: null, day: { in: ends.map((end) => end.day) } }, select: { organisationId: true, day: true, active: true, grace: true, joined: true } });
  const series = ends.map((end) => {
    const onDay = rows.filter((row) => row.day.getTime() === end.day.getTime());
    const perOrg = new Map<string, number>();
    for (const row of onDay) perOrg.set(row.organisationId, (perOrg.get(row.organisationId) ?? 0) + row.active);
    return { label: end.label, active: onDay.reduce((sum, row) => sum + row.active, 0), grace: onDay.reduce((sum, row) => sum + row.grace, 0), tenants: [...perOrg.values()].filter((n) => n > 0).length };
  });
  const latest = ends.at(-1)!.day;
  const top = await prisma.orgDailyStats.groupBy({ by: ["organisationId"], where: { planId: null, day: latest }, _sum: { active: true }, orderBy: { _sum: { active: "desc" } }, take: 10 });
  const names = new Map((await prisma.organisation.findMany({ where: { id: { in: top.map((row) => row.organisationId) } }, select: { id: true, name: true } })).map((org) => [org.id, org.name]));
  return { series, top: top.map((row) => ({ id: row.organisationId, name: names.get(row.organisationId) ?? "Organisation", active: row._sum.active ?? 0 })) };
}

/** A5: members and managers against each organisation's limits (null: no limit), fullest first. Counts match the limit checks. */
export async function usageVsLimits() {
  const orgs = await prisma.organisation.findMany({
    where: { status: { in: [OrganisationStatus.ACTIVE, OrganisationStatus.SUSPENDED] } },
    select: { id: true, name: true, memberLimit: true, managerLimit: true, _count: { select: { members: true, teamMembers: true } } },
  });
  return orgs
    .map((org) => {
      const { memberLimit, managerLimit } = org;
      const share = Math.max(memberLimit ? org._count.members / memberLimit : 0, managerLimit ? org._count.teamMembers / managerLimit : 0);
      return { id: org.id, name: org.name, members: org._count.members, memberLimit, managers: org._count.teamMembers, managerLimit, share };
    })
    .sort((a, b) => b.share - a.share || b.members - a.members)
    .slice(0, 25);
}

/** A6 and A7: outbox state, job heartbeats, database and storage size. */
export async function systemHealth(now: Date) {
  const [outbox, stuck, failed14, sent14, heartbeats, storage] = await Promise.all([
    prisma.outboxMessage.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.outboxMessage.count({ where: { status: OutboxStatus.PENDING, availableAt: { lt: new Date(now.getTime() - 15 * 60_000) } } }),
    prisma.outboxMessage.count({ where: { status: OutboxStatus.FAILED, createdAt: { gte: new Date(now.getTime() - 14 * DAY) } } }),
    prisma.outboxMessage.count({ where: { status: OutboxStatus.SENT, createdAt: { gte: new Date(now.getTime() - 14 * DAY) } } }),
    prisma.operationalHeartbeat.findMany({ where: { key: { in: [OUTBOX_SCHEDULER_HEARTBEAT_KEY, ROLLUP_HEARTBEAT_KEY] } }, select: { key: true, lastStartedAt: true, lastSucceededAt: true, lastSent: true, lastFailed: true, lastError: true } }),
    prisma.asset.aggregate({ _sum: { byteSize: true }, _count: { _all: true } }),
  ]);
  let databaseBytes: number | null = null;
  let databaseOk = true;
  try {
    const [row] = await prisma.$queryRaw<Array<{ size: bigint }>>`select pg_database_size(current_database()) as size`;
    databaseBytes = Number(row?.size ?? 0);
  } catch {
    databaseOk = false;
  }
  const beat = (key: string, freshMs: number) => {
    const row = heartbeats.find((entry) => entry.key === key);
    return { key, lastSucceededAt: row?.lastSucceededAt ?? null, fresh: Boolean(row?.lastSucceededAt && now.getTime() - row.lastSucceededAt.getTime() < freshMs), lastSent: row?.lastSent ?? 0, lastFailed: row?.lastFailed ?? 0, lastError: row?.lastError ?? null };
  };
  return {
    outbox: Object.values(OutboxStatus).map((status) => ({ status, count: outbox.find((row) => row.status === status)?._count._all ?? 0 })),
    stuck,
    failureRate14d: failed14 + sent14 ? failed14 / (failed14 + sent14) : null,
    jobs: [beat(OUTBOX_SCHEDULER_HEARTBEAT_KEY, 3 * 60_000), beat(ROLLUP_HEARTBEAT_KEY, 30 * 60_000)],
    databaseOk,
    databaseBytes,
    storageBytes: Number(storage._sum.byteSize ?? 0),
    storageObjects: storage._count._all,
  };
}

/** A8: what super-admins did, including opening an organisation's data. */
export async function platformAudit(take = 20) {
  return prisma.auditEvent.findMany({
    where: { actor: { is: { isSuperAdmin: true } } },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, action: true, createdAt: true, actor: { select: { name: true, email: true } }, organisation: { select: { name: true } } },
  });
}
