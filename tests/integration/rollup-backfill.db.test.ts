import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const failing = vi.hoisted(() => new Set<string>());
vi.mock("@/lib/reports/rollup", async (original) => {
  const actual = await original<typeof import("@/lib/reports/rollup")>();
  return {
    ...actual,
    recomputeOrgDays: vi.fn(async (...args: Parameters<typeof actual.recomputeOrgDays>) => {
      if (failing.has(args[0])) throw new Error("Bad data");
      return actual.recomputeOrgDays(...args);
    }),
  };
});

import { prisma } from "@/lib/db";
import { openTerm, upsertMember } from "@/lib/membership/service";
import { EXPIRED_BACKFILL_KEY, runExpiredBackfill } from "@/lib/reports/rollupBackfill";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const orgIds: string[] = [];
const extraOrgIds: string[] = [];
const resetCursor = () => delete (globalThis as Record<symbol, unknown>)[Symbol.for("swo.expiredBackfill")];
const backfillRows = { key: { startsWith: EXPIRED_BACKFILL_KEY } };
const orgMark = (organisationId: string) => prisma.operationalHeartbeat.findUnique({ where: { key: `${EXPIRED_BACKFILL_KEY}:${organisationId}` } });
const oldRow = (organisationId: string, day: string) => prisma.orgDailyStats.create({ data: { organisationId, day: new Date(`${day}T00:00:00Z`), computedAt: new Date("2020-01-01T00:00:00Z") } });

async function backfillToTheEnd() {
  resetCursor();
  await prisma.operationalHeartbeat.deleteMany({ where: backfillRows });
  let result = await runExpiredBackfill();
  for (let run = 0; run < 300 && !result.done; run += 1) result = await runExpiredBackfill();
  return result;
}

beforeAll(async () => {
  // More failing organisations than one run takes (10), all ahead of the last one by id.
  for (let index = 0; index < 11; index += 1) {
    const org = await prisma.organisation.create({ data: { name: `Backfill Club ${index}`, slug: `backfill-${index}-${suffix}`, status: "ACTIVE" } });
    await oldRow(org.id, "2026-01-15");
    orgIds.push(org.id);
  }
  orgIds.sort();
  for (const id of orgIds.slice(0, -1)) failing.add(id);
});

afterAll(async () => {
  resetCursor();
  await prisma.organisation.deleteMany({ where: { id: { in: [...orgIds, ...extraOrgIds] } } });
  await prisma.operationalHeartbeat.deleteMany({ where: backfillRows });
  await prisma.$disconnect();
});

describe.sequential("expired backfill", () => {
  // Rebuilds about ten months of days for eleven organisations, so it runs longer than the default limit.
  it("passes over organisations that keep failing, and retries them on a later full pass", async () => {
    resetCursor();
    await prisma.operationalHeartbeat.deleteMany({ where: backfillRows });
    const last = orgIds.at(-1)!;
    for (let run = 0; run < 200 && !(await orgMark(last))?.lastSucceededAt; run += 1) await runExpiredBackfill();
    expect((await orgMark(last))?.lastSucceededAt).toBeTruthy();
    expect(await orgMark(orgIds[0]!)).toBeNull();
    expect((await prisma.operationalHeartbeat.findUniqueOrThrow({ where: { key: EXPIRED_BACKFILL_KEY } })).lastSucceededAt).toBeNull();

    failing.clear();
    let result = await runExpiredBackfill();
    for (let run = 0; run < 200 && !result.done; run += 1) result = await runExpiredBackfill();
    expect(result.done).toBe(true);
    // Every organisation was rebuilt to its old day, and the per-organisation progress rows are gone.
    expect(await prisma.orgDailyStats.count({ where: { organisationId: { in: orgIds }, OR: [{ active: { gt: 0 } }, { grace: { gt: 0 } }, { expired: { gt: 0 } }] } })).toBe(0);
    expect(await prisma.operationalHeartbeat.count({ where: { key: { startsWith: `${EXPIRED_BACKFILL_KEY}:` } } })).toBe(0);
  }, 120_000);

  it("finishes an organisation whose rebuilt days are all zero", async () => {
    const org = await prisma.organisation.create({ data: { name: "Quiet Club", slug: `quiet-${suffix}`, status: "ACTIVE" } });
    extraOrgIds.push(org.id);
    await oldRow(org.id, "2026-08-01");
    const result = await backfillToTheEnd();
    expect(result.done).toBe(true);
    // Each rebuilt day keeps one zero row, so it reads as zero rather than as never computed.
    expect(await prisma.orgDailyStats.count({ where: { organisationId: org.id, OR: [{ active: { gt: 0 } }, { grace: { gt: 0 } }, { expired: { gt: 0 } }] } })).toBe(0);
    expect(await prisma.orgDailyStats.count({ where: { organisationId: org.id, day: new Date("2026-08-01T00:00:00Z"), unitId: null, planId: null } })).toBe(1);
    expect(await runExpiredBackfill()).toEqual({ backfilledDays: 0, done: true });
  });

  it("fills days the old rollup left without rows once every membership lapsed", async () => {
    const org = await prisma.organisation.create({ data: { name: "Lapsed Club", slug: `lapsed-${suffix}`, status: "ACTIVE", createdAt: new Date("2026-01-01T00:00:00Z") } });
    extraOrgIds.push(org.id);
    const plan = await prisma.membershipPlan.create({ data: { organisationId: org.id, name: "Monthly", slug: `monthly-${suffix}`, currency: "INR", priceNewMinor: 0, joinMode: "OPEN", durationType: "ROLLING", durationMonths: 1, graceDays: 0 } });
    const member = await prisma.$transaction((tx) => upsertMember(tx, org.id, { email: `lapsed-${suffix}@example.test`, name: "Lapsed Member", source: "MANUAL" }));
    await prisma.$transaction((tx) => openTerm(tx, { org, plan, memberId: member.id, byManager: true, actorUserId: null, now: new Date("2026-03-01T06:00:00Z") }));
    // Rolled up before `expired` existed: one row while the membership was active, none after it lapsed.
    await oldRow(org.id, "2026-03-05");
    const result = await backfillToTheEnd();
    expect(result.done).toBe(true);
    expect((await prisma.operationalHeartbeat.findUniqueOrThrow({ where: { key: EXPIRED_BACKFILL_KEY } })).lastSucceededAt).toBeTruthy();
    const later = await prisma.orgDailyStats.findMany({ where: { organisationId: org.id, planId: null, day: new Date("2026-06-01T00:00:00Z") }, select: { expired: true } });
    expect(later.reduce((sum, row) => sum + row.expired, 0)).toBeGreaterThan(0);
    expect(await prisma.orgDailyStats.count({ where: { organisationId: org.id, day: new Date("2026-03-05T00:00:00Z"), planId: null, active: { gt: 0 } } })).toBeGreaterThan(0);
  }, 120_000);
});
