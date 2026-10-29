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
import { EXPIRED_BACKFILL_KEY, runExpiredBackfill } from "@/lib/reports/rollupBackfill";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const orgIds: string[] = [];
const resetCursor = () => delete (globalThis as Record<symbol, unknown>)[Symbol.for("swo.expiredBackfill")];
const staleRows = (organisationId: string, since: Date) => prisma.orgDailyStats.count({ where: { organisationId, computedAt: { lt: since } } });

beforeAll(async () => {
  // More failing organisations than one run takes (10), all ahead of the last one by id.
  for (let index = 0; index < 11; index += 1) {
    const org = await prisma.organisation.create({ data: { name: `Backfill Club ${index}`, slug: `backfill-${index}-${suffix}`, status: "ACTIVE" } });
    await prisma.orgDailyStats.create({ data: { organisationId: org.id, day: new Date("2026-01-15T00:00:00Z"), computedAt: new Date("2020-01-01T00:00:00Z") } });
    orgIds.push(org.id);
  }
  orgIds.sort();
  for (const id of orgIds.slice(0, -1)) failing.add(id);
});

afterAll(async () => {
  resetCursor();
  await prisma.organisation.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.operationalHeartbeat.deleteMany({ where: { key: EXPIRED_BACKFILL_KEY } });
  await prisma.$disconnect();
});

describe.sequential("expired backfill cursor", () => {
  it("passes over organisations that keep failing, and retries them on a later full pass", async () => {
    resetCursor();
    await prisma.operationalHeartbeat.deleteMany({ where: { key: EXPIRED_BACKFILL_KEY } });
    await runExpiredBackfill();
    const since = (await prisma.operationalHeartbeat.findUniqueOrThrow({ where: { key: EXPIRED_BACKFILL_KEY } })).lastStartedAt!;
    const last = orgIds.at(-1)!;
    for (let run = 0; run < 200 && (await staleRows(last, since)) > 0; run += 1) await runExpiredBackfill();
    expect(await staleRows(last, since)).toBe(0);
    expect(await staleRows(orgIds[0]!, since)).toBe(1);

    failing.clear();
    let result = await runExpiredBackfill();
    for (let run = 0; run < 200 && !result.done; run += 1) result = await runExpiredBackfill();
    expect(result.done).toBe(true);
    for (const id of orgIds) expect(await staleRows(id, since)).toBe(0);
  });
});
