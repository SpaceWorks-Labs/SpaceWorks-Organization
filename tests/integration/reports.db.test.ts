import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth", () => ({ auth: async () => (mocks.userId ? { user: { id: mocks.userId } } : null) }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimitById: async () => true }));

import { prisma } from "@/lib/db";
import { openTerm, upsertMember } from "@/lib/membership/service";
import { teamScope } from "@/lib/membership/scope";
import { loadDataset, reportScope } from "@/lib/reports/source";
import { membershipSummary } from "@/lib/reports/metrics/flows";
import { dateColumn, daysToRecompute, markStatsDirty, recomputeOrgDays } from "@/lib/reports/rollup";
import { queueManualReminders } from "@/lib/reports/reminders";
import { GET } from "@/app/api/exports/reports/[orgSlug]/[report]/route";
import { addStaff } from "../helpers/staff";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const NOW = new Date("2026-10-20T06:30:00Z");
let org: { id: string; slug: string; timezone: string; financialYearStartMonth: number; createdAt: Date };
let other: { id: string };
const ids: Record<string, string> = {};

async function user(name: string) {
  // Staff need an authenticator before dashboard actions and exports.
  return prisma.user.create({ data: { email: `${name}-${suffix}@example.test`, name, emailVerified: new Date(), mfaEnabledAt: new Date() } });
}

beforeAll(async () => {
  const created = await prisma.organisation.create({ data: { name: "Reports", slug: `reports-${suffix}`, status: "ACTIVE", createdAt: new Date("2026-01-01T00:00:00Z") } });
  org = { id: created.id, slug: created.slug, timezone: created.timezone, financialYearStartMonth: created.financialYearStartMonth, createdAt: created.createdAt };
  other = await prisma.organisation.create({ data: { name: "Other", slug: `other-${suffix}`, status: "ACTIVE" } });
  const north = await prisma.orgUnit.create({ data: { organisationId: org.id, name: "North", slug: "north", code: "NORTH", path: "x" } });
  await prisma.orgUnit.update({ where: { id: north.id }, data: { path: north.id } });
  const south = await prisma.orgUnit.create({ data: { organisationId: org.id, name: "South", slug: "south", code: "SOUTH", path: "y" } });
  await prisma.orgUnit.update({ where: { id: south.id }, data: { path: south.id } });
  const foreign = await prisma.orgUnit.create({ data: { organisationId: other.id, name: "Elsewhere", slug: "elsewhere", code: "ELSE", path: "z" } });
  Object.assign(ids, { north: north.id, south: south.id, foreign: foreign.id });
  const plan = await prisma.membershipPlan.create({ data: { organisationId: org.id, name: "Free", slug: `free-${suffix}`, currency: "INR", priceNewMinor: 0, joinMode: "OPEN", durationType: "ORG_YEAR" } });
  for (const [key, unitId, when] of [["n1", north.id, "2026-05-10T06:00:00Z"], ["n2", north.id, "2026-07-01T06:00:00Z"], ["s1", south.id, "2026-06-01T06:00:00Z"]] as const) {
    const m = await prisma.$transaction((tx) => upsertMember(tx, org.id, { email: `${key}-${suffix}@example.test`, name: key, source: "MANUAL", unitId, phone: "+91 98470 12345" }));
    const t = await prisma.$transaction((tx) => openTerm(tx, { org, plan, memberId: m.id, byManager: true, actorUserId: null, now: new Date(when) }));
    ids[key] = m.id;
    ids[`term-${key}`] = t.id;
  }
  const owner = await user("owner");
  const viewer = await user("viewer");
  const southAdmin = await user("south");
  const stranger = await user("stranger");
  await addStaff(org.id, owner.id, "OWNER");
  await addStaff(org.id, viewer.id, "VIEWER");
  await addStaff(org.id, southAdmin.id, "ADMIN", south.id);
  await addStaff(other.id, stranger.id, "OWNER");
  Object.assign(ids, { owner: owner.id, viewer: viewer.id, southAdmin: southAdmin.id, stranger: stranger.id });
});

afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM "OutboxMessage" WHERE "payload"->>'organisationId' = ${org.id}`;
  await prisma.organisation.deleteMany({ where: { id: { in: [org.id, other.id] } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { email: { endsWith: `-${suffix}@example.test` } } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe.sequential("report loaders", () => {
  it("keeps a unit-scoped manager inside their subtree, whatever unit filter they send", async () => {
    const team = await teamScope(org.id, ids.south);
    const fy = { from: new Date("2026-03-31T18:30:00Z"), to: NOW };
    expect(membershipSummary(await loadDataset(await reportScope(team, {})), fy, NOW).activeEnd).toBe(1);
    // Asking for the north unit, or another organisation's unit, never widens the scope.
    expect((await reportScope(team, { unit: ids.north })).unitPath).toBe(team.unitPath);
    const orgWide = await teamScope(org.id, null);
    expect((await reportScope(orgWide, { unit: ids.foreign })).unitPath).toBeNull();
    expect(membershipSummary(await loadDataset(await reportScope(orgWide, { unit: ids.north })), fy, NOW).joined).toBe(2);
  });
});

describe.sequential("daily rollup", () => {
  it("rebuilds whole days from source rows, idempotently", async () => {
    const days = [{ year: 2026, month: 7, day: 1 }, { year: 2026, month: 10, day: 19 }];
    await recomputeOrgDays(org.id, days, NOW);
    const first = await prisma.orgDailyStats.findMany({ where: { organisationId: org.id, planId: null }, orderBy: [{ day: "asc" }, { unitId: "asc" }], select: { day: true, unitId: true, active: true, joined: true } });
    await recomputeOrgDays(org.id, days, NOW);
    const again = await prisma.orgDailyStats.findMany({ where: { organisationId: org.id, planId: null }, orderBy: [{ day: "asc" }, { unitId: "asc" }], select: { day: true, unitId: true, active: true, joined: true } });
    expect(again).toEqual(first);
    expect(first.filter((row) => row.day.getTime() === dateColumn(days[1]).getTime()).reduce((sum, row) => sum + row.active, 0)).toBe(3);
    expect(first.find((row) => row.day.getTime() === dateColumn(days[0]).getTime() && row.unitId === ids.north)).toMatchObject({ joined: 1 });
  });

  it("marks backdated days dirty and rebuilds them on the next run", async () => {
    await markStatsDirty(prisma, org.id, new Date("2026-10-17T06:00:00Z"), NOW);
    const wanted = await daysToRecompute(org, NOW);
    const keys = wanted.map((d) => `${d.month}-${d.day}`);
    expect(keys).toEqual(expect.arrayContaining(["10-17", "10-18", "10-19", "10-20"]));
    await recomputeOrgDays(org.id, wanted, NOW);
    expect(await prisma.orgStatsDirtyDay.count({ where: { organisationId: org.id } })).toBe(0);
  });
});

describe.sequential("audited, streamed exports", () => {
  const call = async (userId: string, report: string, query = "", slug = org.slug) => {
    mocks.userId = userId;
    return GET(new Request(`http://localhost/api/exports/reports/${slug}/${report}${query}`), { params: Promise.resolve({ orgSlug: slug, report }) });
  };

  it("streams the register and audits who, which report, the filters and the row count", async () => {
    const response = await call(ids.owner, "register", `?unit=${ids.north}`);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text.trim().split("\r\n")).toHaveLength(3);
    expect(text).toContain(`n1-${suffix}@example.test`);
    const audit = await prisma.auditEvent.findFirst({ where: { organisationId: org.id, action: "REPORT_EXPORTED", actorUserId: ids.owner }, orderBy: { createdAt: "desc" } });
    expect(audit?.metadata).toMatchObject({ report: "register", rows: 2, complete: true, unit: ids.north, period: "fy" });
  });

  it("masks contact details for a viewer", async () => {
    const text = await (await call(ids.viewer, "register")).text();
    expect(text).not.toContain(`@example.test`);
    expect(text).toContain("•••• 45");
  });

  it("refuses finance exports to a viewer, unknown reports and other organisations", async () => {
    expect((await call(ids.viewer, "revenue")).status).toBe(403);
    expect((await call(ids.owner, "everything")).status).toBe(404);
    expect((await call(ids.stranger, "register")).status).toBe(404);
    mocks.userId = "";
    expect((await call("", "register")).status).toBe(401);
  });

  it("audits finance exports as finance exports", async () => {
    const response = await call(ids.owner, "outstanding");
    await response.text();
    // One row before any data leaves (exports fail closed), one when the stream finishes with the count.
    const rows = await prisma.auditEvent.findMany({ where: { organisationId: org.id, action: "FINANCE_REPORT_EXPORTED" }, orderBy: { createdAt: "asc" }, select: { metadata: true } });
    expect(rows).toHaveLength(2);
    expect(rows[0].metadata).toMatchObject({ report: "outstanding", stage: "started" });
    expect(rows[1].metadata).toMatchObject({ report: "outstanding", complete: true });
  });
});

describe.sequential("bulk renewal reminders", () => {
  it("queues once per membership per day, inside the manager's scope only", async () => {
    const southTeam = await teamScope(org.id, ids.south);
    const result = await queueManualReminders(southTeam, org.timezone, [ids["term-s1"], ids["term-n1"]], NOW);
    expect(result).toEqual({ queued: 1, skipped: 1 });
    expect(await prisma.reminderLog.findMany({ where: { termId: ids["term-s1"] }, select: { key: true } })).toEqual([{ key: "before-manual-2026-10-20" }]);
    expect(await queueManualReminders(southTeam, org.timezone, [ids["term-s1"]], NOW)).toEqual({ queued: 0, skipped: 1 });
    expect(await prisma.outboxMessage.count({ where: { kind: "renewal-reminder", payload: { path: ["termId"], equals: ids["term-s1"] } } })).toBe(1);
  });
});
