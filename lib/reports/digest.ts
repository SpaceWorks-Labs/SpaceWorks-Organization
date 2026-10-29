import "server-only";

import { prisma } from "@/lib/db";
import { enqueueOutbox } from "@/lib/outbox";
import { queueChatAlerts } from "@/lib/chat/notify";
import { can, type Capability } from "@/lib/permissionRoles";
import { staffWithCapability } from "@/lib/team/roles";
import { addMonths, localDate, startOfLocalDay } from "@/lib/membership/periods";
import { teamScope } from "@/lib/membership/scope";
import { prepareDataset } from "./dataset";
import { membershipSummary, type MembershipSummary } from "./metrics/flows";
import { loadReportRows, reportScope } from "./source";
import { loadFinanceRows } from "./finance/source";
import { revenueSummary, type RevenueSummary } from "./finance/revenue";

/**
 * The monthly summary email: on the first scheduler pass of each month, staff whose role holds DIGEST_CAPABILITY
 * and who haven't switched it off get last month's figures for what they can see (their unit when scoped).
 * One claim per organisation and month, so replicas and retries never send twice.
 */

const RUN_EVERY_MS = 60 * 60_000;
/** Who gets the digest: the finance-report permission, held by the starter Owner, Manager and Treasurer roles (not Viewer). */
export const DIGEST_CAPABILITY: Capability = "reports.finance";

function state() {
  return globalThis as typeof globalThis & { __sworgDigestAt?: number };
}

const monthKey = (day: { year: number; month: number }) => `${day.year}-${String(day.month).padStart(2, "0")}`;

export async function queueMonthlyDigests(now = new Date(), force = false) {
  const runtime = state();
  if (!force && runtime.__sworgDigestAt && now.getTime() - runtime.__sworgDigestAt < RUN_EVERY_MS) return 0;
  runtime.__sworgDigestAt = now.getTime();
  const orgs = await prisma.organisation.findMany({ where: { status: "ACTIVE" }, select: { id: true, timezone: true, createdAt: true } });
  let queued = 0;
  for (const org of orgs) {
    const today = localDate(now, org.timezone);
    const last = addMonths({ year: today.year, month: today.month, day: 1 }, -1);
    // Nothing to summarise for an organisation created after last month ended.
    if (org.createdAt >= startOfLocalDay({ year: today.year, month: today.month, day: 1 }, org.timezone)) continue;
    const key = `report-digest:${monthKey(last)}`;
    // The claim and the emails commit together, so a crash midway leaves the month unclaimed for a retry.
    queued += await prisma.$transaction(async (tx) => {
      const claimed = await tx.$queryRaw<Array<{ next: number }>>`
        INSERT INTO "OrgCounter" ("organisationId", "name", "next") VALUES (${org.id}, ${key}, 1)
        ON CONFLICT ("organisationId", "name") DO NOTHING RETURNING "next"`;
      if (claimed.length === 0) return 0;
      const team = await staffWithCapability(tx, org.id, DIGEST_CAPABILITY, { where: { reportDigest: true, user: { emailVerified: { not: null } } } });
      for (const person of team) await enqueueOutbox(tx, "report-digest", { organisationId: org.id, userId: person.userId, month: monthKey(last) });
      await queueChatAlerts(tx, org.id, "monthly-summary", { month: monthKey(last) });
      return team.length;
    });
  }
  return queued;
}

type Digest = {
  organisation: { name: string; slug: string; locale: string | null; currency: string };
  to: string;
  firstName: string;
  monthLabel: string;
  unitName: string | null;
  membership: MembershipSummary;
  money: RevenueSummary | null;
  waitingForApproval: number;
};

/** Last month's figures for one person, worked out when the email is sent. Null when they no longer qualify. */
export async function buildDigest(payload: { organisationId: string; userId: string; month: string }, now = new Date()): Promise<Digest | null> {
  const member = await prisma.teamMember.findUnique({
    where: { userId_organisationId: { userId: payload.userId, organisationId: payload.organisationId } },
    select: { orgRole: { select: { isOwner: true, capabilities: true } }, unitId: true, reportDigest: true, user: { select: { email: true, name: true, emailVerified: true } }, organisation: { select: { name: true, slug: true, status: true, timezone: true, locale: true, currency: true } }, unit: { select: { name: true } } },
  });
  if (!member?.reportDigest || !member.user.email || !member.user.emailVerified || member.organisation.status !== "ACTIVE" || !can(member, DIGEST_CAPABILITY)) return null;
  const [year, month] = payload.month.split("-").map(Number);
  if (!year || !month) return null;
  const org = member.organisation;
  const first = { year, month, day: 1 };
  const window = { from: startOfLocalDay(first, org.timezone), to: startOfLocalDay(addMonths(first, 1), org.timezone) };
  const scope = await reportScope(await teamScope(payload.organisationId, member.unitId), {});
  const data = prepareDataset(await loadReportRows(scope));
  const money = can(member, "reports.finance") ? revenueSummary(await loadFinanceRows(scope), window, org.currency) : null;
  const waitingForApproval = await prisma.membershipTerm.count({ where: { organisationId: payload.organisationId, status: "PENDING_APPROVAL", member: { is: scope.unitPath ? { unit: { is: { OR: [{ path: scope.unitPath }, { path: { startsWith: `${scope.unitPath}/` } }] } } } : {} } } });
  return {
    organisation: { name: org.name, slug: org.slug, locale: org.locale, currency: org.currency },
    to: member.user.email,
    firstName: (member.user.name ?? "").split(/\s+/)[0] || "there",
    monthLabel: new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 15))),
    unitName: member.unit?.name ?? null,
    membership: membershipSummary(data, window, now),
    money,
    waitingForApproval,
  };
}
