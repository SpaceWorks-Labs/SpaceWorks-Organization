import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cache", async (original) => ({ ...(await original<typeof import("@/lib/cache")>()), cached: async (_key: string, _ttl: number, load: () => Promise<unknown>) => load() }));

import { prisma } from "@/lib/db";
import { recordVisit } from "@/lib/visits/record";
import { loadVisitSummary, loadVisitTotalsByOrganisation } from "@/lib/visits/read";

// The platform row has no organisation, so it counts on the partial unique index WebVisitDaily_platform_key
// (raw ON CONFLICT); an organisation row counts through the ordinary composite unique key.
const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const day = new Date("2031-03-14T10:00:00.000Z");
const key = "2031-03-14";
const platformRoute = "/features";
let orgId = "";

beforeAll(async () => {
  orgId = (await prisma.organisation.create({ data: { name: "Example Visits", slug: `visits-${suffix}`, status: "ACTIVE" } })).id;
  await prisma.webVisitDaily.deleteMany({ where: { organisationId: null, route: platformRoute, day: new Date(`${key}T00:00:00.000Z`) } });
});

afterAll(async () => {
  await prisma.webVisitDaily.deleteMany({ where: { organisationId: null, route: platformRoute, day: new Date(`${key}T00:00:00.000Z`) } });
  await prisma.organisation.delete({ where: { id: orgId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe.sequential("web visit counts", () => {
  it("keeps one platform row per day and route and adds to it, even for simultaneous visits", async () => {
    await Promise.all(Array.from({ length: 12 }, () => recordVisit(null, platformRoute, day)));
    const rows = await prisma.webVisitDaily.findMany({ where: { organisationId: null, route: platformRoute, day: new Date(`${key}T00:00:00.000Z`) } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ count: 12, channel: "web" });
  });

  it("counts an organisation's visits on its own row, apart from the platform's", async () => {
    await Promise.all(Array.from({ length: 5 }, () => recordVisit(orgId, "/o/:orgSlug", day)));
    await recordVisit(orgId, "/o/:orgSlug/join/:planSlug", day);
    const rows = await prisma.webVisitDaily.findMany({ where: { organisationId: orgId }, orderBy: { route: "asc" } });
    expect(rows.map((row) => [row.route, row.count])).toEqual([["/o/:orgSlug", 5], ["/o/:orgSlug/join/:planSlug", 1]]);
    const platform = await prisma.webVisitDaily.findMany({ where: { organisationId: null, route: platformRoute, day: new Date(`${key}T00:00:00.000Z`) } });
    expect(platform[0].count).toBe(12);
  });

  it("starts a new row for a new UTC day", async () => {
    await recordVisit(orgId, "/o/:orgSlug", new Date("2031-03-15T00:00:01.000Z"));
    expect(await prisma.webVisitDaily.count({ where: { organisationId: orgId, route: "/o/:orgSlug" } })).toBe(2);
  });

  it("reads back summaries per organisation and for the platform, never mixing them", async () => {
    const org = await loadVisitSummary(orgId, key, "2031-03-15");
    expect(org.total).toBe(7);
    expect(org.byRoute[0]).toMatchObject({ route: "/o/:orgSlug", count: 6 });
    const platform = await loadVisitSummary(null, key, key);
    expect(platform.byRoute.find((row) => row.route === platformRoute)?.count).toBe(12);
    expect(platform.byRoute.some((row) => row.route.startsWith("/o/"))).toBe(false);
    expect((await loadVisitTotalsByOrganisation(key, "2031-03-15"))[orgId]).toBe(7);
  });
});
