import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const forbidden = () => { throw new Error("A sample must never read members or cards"); };
  return {
    cacheKeys: [] as string[],
    holders: [] as unknown[],
    queries: [] as string[],
    prisma: {
      member: { count: vi.fn(async () => 12), findMany: vi.fn(forbidden), findUnique: vi.fn(forbidden), findFirst: vi.fn(forbidden) },
      memberCard: { findMany: vi.fn(forbidden), findUnique: vi.fn(forbidden), findFirst: vi.fn(forbidden) },
      membershipPlan: { findMany: vi.fn(async () => [{ id: "plan_1", name: "Annual" }]) },
      $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
        const sql = strings.join("?");
        mocks.queries.push(sql);
        return sql.includes("MembershipPlan")
          ? [{ label: "Annual", count: 30 }, { label: "Student", count: 3 }, { label: "Life", count: 9 }]
          : [{ label: "North", count: 20 }, { label: "South", count: 4 }];
      }),
    },
  };
});

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/cache", async (original) => ({
  ...(await original<typeof import("@/lib/cache")>()),
  cached: async (key: string, _ttl: number, load: () => Promise<unknown>) => { mocks.cacheKeys.push(key); return load(); },
}));
vi.mock("@/lib/cards/data", () => ({
  loadCardOrgContext: vi.fn(async (organisationId: string) => ({
    organisation: { id: organisationId, name: "Sample society", slug: "sample", logoUrl: null, accentColor: "#006E63", timezone: "Asia/Kolkata", status: "ACTIVE", unitLevels: [], delightEnabled: true },
    designs: [{ planId: null, roleId: null, design: {}, watermarkUrl: null, numberPrefix: "SMP", numberFormat: "{PREFIX}-{SEQ:4}" }],
    fields: new Map(),
    units: new Map(),
  })),
  organisationDesignRow: (ctx: { designs: Array<{ planId: string | null; roleId: string | null }> }) => ctx.designs.find((row) => row.planId === null && row.roleId === null),
  designFor: () => ({ design: { front: { widthMm: 85.6, heightMm: 53.98 }, back: {}, backEnabled: false }, branding: { orgAccent: "#006E63", organisationLogoUrl: null, watermarkUrl: null }, source: "organisation" }),
}));
vi.mock("@/lib/cards/render", () => ({
  renderMemberCard: vi.fn(async (_input: unknown, holder: unknown) => { mocks.holders.push(holder); return Buffer.from("png"); }),
}));
vi.mock("sharp", () => ({ default: () => ({ resize: () => ({ webp: () => ({ toBuffer: async () => Buffer.from("webp-bytes") }) }) }) }));

import { loadPublicCounts } from "@/lib/publicPage/counts";
import { renderSampleCard, SAMPLE_HOLDER_NAME, sampleCardFor } from "@/lib/publicPage/sampleCard";

beforeEach(() => {
  mocks.cacheKeys.length = 0;
  mocks.holders.length = 0;
  mocks.queries.length = 0;
});

describe("live counts", () => {
  it("returns aggregates only, with small counts removed", async () => {
    const counts = await loadPublicCounts("org_a", { total: true, byPlan: true, byUnit: true });
    // Student (3) is hidden, so the smallest shown plan (Life, 9) goes too; South (4) alone hides North.
    expect(counts).toEqual({ total: 12, byPlan: [{ label: "Annual", count: 30 }], byUnit: [] });
    for (const sql of mocks.queries) {
      expect(sql).toContain(`"organisationId" = ?`);
      expect(sql).toContain(`"anonymisedAt" IS NULL`);
      expect(sql).not.toMatch(/m\."(name|email|phone)"/);
    }
  });

  it("loads nothing that no section asks for, and hides a small total", async () => {
    expect(await loadPublicCounts("org_a", { total: false, byPlan: false, byUnit: false })).toBeNull();
    mocks.prisma.member.count.mockResolvedValueOnce(3);
    expect(await loadPublicCounts("org_a", { total: true, byPlan: false, byUnit: false })).toEqual({ total: null, byPlan: [], byUnit: [] });
    expect(mocks.queries).toEqual([]);
    expect(mocks.prisma.member.count).toHaveBeenLastCalledWith({ where: expect.objectContaining({ organisationId: "org_a", anonymisedAt: null }) });
  });
});

describe("sample member card", () => {
  it("draws the organisation's live design with fictional holder data only", async () => {
    const body = await renderSampleCard("org_a");
    expect(body?.toString()).toBe("webp-bytes");
    expect(mocks.holders).toHaveLength(1);
    expect(mocks.holders[0]).toMatchObject({ displayName: SAMPLE_HOLDER_NAME, memberId: "sample", photoUrl: null, details: [], idNumber: "SMP-0042", verifyUrl: "https://example.org/verify/sample" });
    for (const fn of [...Object.values(mocks.prisma.member).filter((one) => one !== mocks.prisma.member.count), ...Object.values(mocks.prisma.memberCard)]) expect(fn).not.toHaveBeenCalled();
  });

  it("caches under the organisation's own key, versioned by what it draws", async () => {
    await renderSampleCard("org_a");
    await renderSampleCard("org_b");
    expect(mocks.cacheKeys).toHaveLength(2);
    expect(mocks.cacheKeys[0]).toMatch(/^swo:cache:v1:org:org_a:public-page:sample-card:[0-9a-f]{16}$/);
    expect(mocks.cacheKeys[1]).toMatch(/^swo:cache:v1:org:org_b:public-page:sample-card:/);
    const card = await sampleCardFor({ id: "org_a", slug: "sample" });
    expect(card).toEqual({ src: `/api/o/sample/sample-card?v=${mocks.cacheKeys[0]!.split(":").at(-1)}`, widthMm: 85.6, heightMm: 53.98 });
  });
});
