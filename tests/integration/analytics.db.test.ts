import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth", () => ({ auth: async () => (mocks.userId ? { user: { id: mocks.userId } } : null) }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimitById: async () => true }));

import { prisma } from "@/lib/db";
import { openTerm, upsertMember } from "@/lib/membership/service";
import { localDate } from "@/lib/membership/periods";
import { dateColumn, recomputeOrgDays } from "@/lib/reports/rollup";
import { EXPIRED_BACKFILL_KEY, runExpiredBackfill } from "@/lib/reports/rollupBackfill";
import { loadOrgReportsUnits } from "@/lib/views/app__dashboard__orgSlug__reports__units__page";
import { loadSuperAdminAnalyticsView } from "@/lib/views/app__super-admin__analytics__page";
import { loadSuperAdminOrgAnalyticsView } from "@/lib/views/app__super-admin__orgs__orgId__analytics__page";
import { GET as exportComparison } from "@/app/api/exports/platform/analytics/route";
import { addStaff } from "../helpers/staff";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const now = new Date();
let org: { id: string; slug: string; timezone: string; financialYearStartMonth: number; createdAt: Date };
const ids: Record<string, string> = {};
// Member details that must never reach the super-admin pages.
const people = [
  { key: "n1", name: `Zed Alpha ${suffix}`, unit: "north1", when: new Date(now.getTime() - 20 * 86_400_000), paid: false },
  { key: "n0", name: `Yara Beta ${suffix}`, unit: "north", when: new Date(now.getTime() - 20 * 86_400_000), paid: false },
  { key: "old", name: `Xan Gamma ${suffix}`, unit: "north", when: new Date("2024-05-01T06:00:00Z"), paid: false },
  { key: "s1", name: `Wren Delta ${suffix}`, unit: "south", when: new Date(now.getTime() - 5 * 86_400_000), paid: true },
];

async function user(name: string, extra: { isSuperAdmin?: boolean } = {}) {
  return prisma.user.create({ data: { email: `${name}-${suffix}@example.test`, name, emailVerified: new Date(), mfaEnabledAt: new Date(), ...extra } });
}

async function unit(name: string, code: string, parent?: { id: string; path: string }) {
  const created = await prisma.orgUnit.create({ data: { organisationId: org.id, name, slug: `${code.toLowerCase()}-${suffix}`, code, path: "pending", level: parent ? 1 : 0, parentId: parent?.id ?? null } });
  return prisma.orgUnit.update({ where: { id: created.id }, data: { path: parent ? `${parent.path}/${created.id}` : created.id } });
}

beforeAll(async () => {
  const created = await prisma.organisation.create({ data: { name: `Example Network ${suffix}`, slug: `example-network-${suffix}`, status: "ACTIVE", unitLevels: ["Area", "Unit"], createdAt: new Date("2024-01-01T00:00:00Z") } });
  org = { id: created.id, slug: created.slug, timezone: created.timezone, financialYearStartMonth: created.financialYearStartMonth, createdAt: created.createdAt };
  const north = await unit("North", "NORTH");
  const north1 = await unit("North 1", "NORTH1", north);
  const south = await unit("South", "SOUTH");
  Object.assign(ids, { north: north.id, north1: north1.id, south: south.id });
  const free = await prisma.membershipPlan.create({ data: { organisationId: org.id, name: "Free", slug: `free-${suffix}`, currency: "INR", priceNewMinor: 0, joinMode: "OPEN", durationType: "ORG_YEAR" } });
  const paid = await prisma.membershipPlan.create({ data: { organisationId: org.id, name: "Paid", slug: `paid-${suffix}`, currency: "INR", priceNewMinor: 50_000, joinMode: "OPEN", durationType: "ORG_YEAR" } });
  for (const person of people) {
    const member = await prisma.$transaction((tx) => upsertMember(tx, org.id, { email: `${person.key}-${suffix}@example.test`, name: person.name, source: "MANUAL", unitId: ids[person.unit], phone: "+91 98470 55555" }));
    await prisma.$transaction((tx) => openTerm(tx, { org, plan: person.paid ? paid : free, memberId: member.id, byManager: true, actorUserId: null, now: person.when }));
    ids[person.key] = member.id;
  }
  const owner = await user("owner");
  const northLead = await user("north-lead");
  const admin = await user("platform", { isSuperAdmin: true });
  await addStaff(org.id, owner.id, "OWNER");
  await addStaff(org.id, northLead.id, "ADMIN", north.id);
  Object.assign(ids, { owner: owner.id, northLead: northLead.id, admin: admin.id });
});

afterAll(async () => {
  await prisma.organisation.deleteMany({ where: { id: org.id } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { email: { endsWith: `-${suffix}@example.test` } } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe.sequential("expired stock and its backfill", () => {
  const today = () => localDate(now, org.timezone);
  const snapshot = () => prisma.orgDailyStats.findMany({ where: { organisationId: org.id, planId: null }, orderBy: [{ day: "asc" }, { unitId: "asc" }], select: { day: true, unitId: true, active: true, expired: true, computedAt: true } });

  it("counts a member whose last membership lapsed as expired in their unit", async () => {
    await recomputeOrgDays(org.id, [today()], now);
    const rows = await snapshot();
    expect(rows.find((row) => row.unitId === ids.north)).toMatchObject({ active: 1, expired: 1 });
    expect(rows.find((row) => row.unitId === ids.north1)).toMatchObject({ active: 1, expired: 0 });
  });

  it("refills rows rolled up before the column existed, and repeats nothing once done", async () => {
    await prisma.orgDailyStats.updateMany({ where: { organisationId: org.id }, data: { expired: 0, computedAt: new Date("2020-01-01T00:00:00Z") } });
    await prisma.operationalHeartbeat.deleteMany({ where: { key: EXPIRED_BACKFILL_KEY } });
    let result = await runExpiredBackfill(now);
    for (let guard = 0; !result.done && guard < 100; guard += 1) result = await runExpiredBackfill(now);
    expect(result.done).toBe(true);
    const filled = await snapshot();
    expect(filled.find((row) => row.day.getTime() === dateColumn(today()).getTime() && row.unitId === ids.north)).toMatchObject({ expired: 1 });
    expect((await prisma.operationalHeartbeat.findUnique({ where: { key: EXPIRED_BACKFILL_KEY } }))?.lastSucceededAt).toBeTruthy();
    // A second run is a no-op: the same rows, not even rewritten.
    expect(await runExpiredBackfill(now)).toEqual({ backfilledDays: 0, done: true });
    expect(await snapshot()).toEqual(filled);
  });
});

describe.sequential("drill-down by level", () => {
  const view = (userId: string, unit?: string) => {
    mocks.userId = userId;
    return loadOrgReportsUnits({ params: Promise.resolve({ orgSlug: org.slug }), searchParams: Promise.resolve(unit ? { unit } : {}) });
  };

  it("starts organisation-wide staff at the top level, with money per currency", async () => {
    const result = await view(ids.owner);
    expect(result.levelName).toBe("Area");
    expect(result.rows.map((row) => row.name).sort()).toEqual(["North", "South"]);
    expect(result.rows.find((row) => row.name === "North")).toMatchObject({ active: 2, hasChildren: true });
    expect(result.rows.find((row) => row.name === "South")?.outstanding).toEqual([{ currency: "INR", minor: 50_000 }]);
  });

  it("keeps a unit-scoped lead inside their subtree, whatever unit they ask for", async () => {
    for (const unit of [undefined, ids.south]) {
      const result = await view(ids.northLead, unit);
      expect(result.trail.map((step) => step.label)).toEqual(["North"]);
      expect(result.rows.map((row) => row.name)).toEqual(["North 1", "This unit directly"]);
      expect(result.rows.flatMap((row) => row.outstanding ?? [])).toEqual([]);
    }
  });
});

describe.sequential("super-admin analytics", () => {
  const forbidden = () => people.flatMap((person) => [person.name, `${person.key}-${suffix}@example.test`, "98470 55555", ids[person.key]]);

  it("shows one organisation's aggregates only, and audits the view once per half hour", async () => {
    mocks.userId = ids.admin;
    const first = await loadSuperAdminOrgAnalyticsView({ params: Promise.resolve({ orgId: org.id }) });
    await loadSuperAdminOrgAnalyticsView({ params: Promise.resolve({ orgId: org.id }) });
    const text = JSON.stringify(first);
    for (const value of forbidden()) expect(text).not.toContain(value);
    expect(first.breakdown.find((row) => row.name === "North")).toMatchObject({ active: 2, expired: 1 });
    expect(first.outstanding).toEqual([{ currency: "INR", minor: 50_000 }]);
    expect(await prisma.auditEvent.count({ where: { action: "SUPER_ADMIN_ORG_ANALYTICS_VIEWED", actorUserId: ids.admin, organisationId: org.id } })).toBe(1);
  });

  it("compares organisations and exports the table without member details, audited", async () => {
    mocks.userId = ids.admin;
    const result = await loadSuperAdminAnalyticsView({ searchParams: Promise.resolve({ sort: "name", dir: "asc" }) });
    const text = JSON.stringify(result);
    for (const value of forbidden()) expect(text).not.toContain(value);
    expect(result.rows.find((row) => row.id === org.id)).toMatchObject({ active: 2, outstanding: [{ currency: "INR", minor: 50_000 }] });
    const response = await exportComparison(new Request("http://localhost/api/exports/platform/analytics?sort=active"));
    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain(`Example Network ${suffix}`);
    for (const value of forbidden()) expect(csv).not.toContain(value);
    const audit = await prisma.auditEvent.findFirst({ where: { action: "PLATFORM_REPORT_EXPORTED", actorUserId: ids.admin }, orderBy: { createdAt: "desc" } });
    expect(audit?.metadata).toMatchObject({ report: "organisation-comparison", complete: true, sort: "active" });
  });

  it("refuses the export to anyone but a platform super admin", async () => {
    mocks.userId = ids.owner;
    expect((await exportComparison(new Request("http://localhost/api/exports/platform/analytics"))).status).toBe(404);
  });
});
