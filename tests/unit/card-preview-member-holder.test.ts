import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  findDesignScope: vi.fn(),
  teamScope: vi.fn(),
  memberFindMany: vi.fn(),
  memberFindFirst: vi.fn(),
  orgFindUnique: vi.fn(),
  planFindFirst: vi.fn(),
  fieldFindMany: vi.fn(),
  unitFindMany: vi.fn(),
}));

vi.mock("@/lib/cards/designerAccess", () => ({ cardDesignerReadAccess: mocks.read, findDesignScope: mocks.findDesignScope, NOT_FOUND: "Not found." }));
vi.mock("@/lib/membership/scope", () => ({
  teamScope: mocks.teamScope,
  memberWhere: (scope: { organisationId: string; unitPath: string | null }) => (scope.unitPath ? { organisationId: scope.organisationId, AND: [{ unit: { is: { path: scope.unitPath } } }] } : { organisationId: scope.organisationId }),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    member: { findMany: mocks.memberFindMany, findFirst: mocks.memberFindFirst },
    organisation: { findUnique: mocks.orgFindUnique },
    membershipPlan: { findFirst: mocks.planFindFirst },
    planField: { findMany: mocks.fieldFindMany },
    orgUnit: { findMany: mocks.unitFindMany },
  },
}));

import { loadCardPreviewHolder, searchCardPreviewMembers } from "@/app/actions/card-preview";
import { PREVIEW_SEARCH_LIMIT, PREVIEW_VERIFY_TOKEN, previewHolder, previewPlanId } from "@/lib/cards/previewHolder";

const UUID = "0b5c3f9e-2a41-4c6d-9e8f-1a2b3c4d5e6f";
const org = { id: "org_1", slug: "example-org", name: "Example" };
const unitScope = { organisationId: "org_1", unitId: "u_n", unitPath: "u_n", limits: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue({ ok: true, userId: "user_1", organisation: org, membership: { id: "tm_1", unitId: "u_n" } });
  mocks.teamScope.mockResolvedValue(unitScope);
  mocks.findDesignScope.mockResolvedValue({ plan: { id: "plan_1", name: "Annual" }, role: null, where: { organisationId: "org_1", planId: "plan_1", roleId: null } });
  mocks.orgFindUnique.mockResolvedValue({ id: "org_1", timezone: "Asia/Kolkata", unitLevels: ["Area"], website: "https://example.org", contactEmail: "hello@example.org", contactPhone: null });
  mocks.planFindFirst.mockResolvedValue({ name: "Annual" });
  mocks.fieldFindMany.mockResolvedValue([{ key: "blood", label: "Blood group" }]);
  mocks.unitFindMany.mockResolvedValue([{ id: "u_n", name: "North", code: "N", level: 0, path: "u_n" }]);
});

describe("previewHolder", () => {
  it("copies only the allowed fields, with sample answers and a dummy QR", () => {
    const source = {
      name: "Asha Rao", roleName: "Secretary", planName: "Annual", cardNumber: "EX-0042", validUntil: "31 Mar 2027",
      units: [{ level: 0, levelName: "Area", name: "North", code: "N", extra: "x" }], photoUrl: null,
      contact: { website: "example.org", email: null, phone: null, secret: "x" },
      fields: [{ key: "blood", label: "Blood group" }, { key: "dob", label: "Date of birth" }, { key: "note", label: "Note" }],
      // Things a member record has that must never reach the designer.
      email: "asha@example.com", phone: "+91 90000 00001", fieldValues: { blood: "B-" }, verifyToken: "real-token", memberId: "m_1",
    };
    const holder = previewHolder(source as never);
    expect(Object.keys(holder).sort()).toEqual(["contact", "details", "displayName", "idNumber", "memberId", "photoUrl", "planName", "role", "units", "validUntil", "verifyToken", "verifyUrl"]);
    expect(holder.verifyToken).toBe(PREVIEW_VERIFY_TOKEN);
    expect(holder.memberId).toBe("preview");
    expect(holder.details.map((detail) => detail.value)).toEqual(["O+", "14 Feb 1998", "Sample answer"]);
    const text = JSON.stringify(holder);
    for (const secret of ["asha@example.com", "90000 00001", "B-", "real-token", "m_1", "secret", "extra"]) expect(text).not.toContain(secret);
  });

  it("prefers the design's plan, then the newest live card, then the newest term", () => {
    const cards = [{ planId: "p_old", issuedAt: new Date("2025-01-01") }, { planId: "p_new", issuedAt: new Date("2026-01-01") }];
    const terms = [{ planId: "p_term", createdAt: new Date("2026-06-01") }];
    expect(previewPlanId("p_term", cards, terms)).toBe("p_term");
    expect(previewPlanId("p_none", cards, terms)).toBe("p_new");
    expect(previewPlanId(null, [], terms)).toBe("p_term");
    expect(previewPlanId(null, [], [])).toBeNull();
  });
});

describe("searchCardPreviewMembers", () => {
  it("needs cards.design and members.view, and searches only inside the viewer's scope, at most 20", async () => {
    mocks.memberFindMany.mockResolvedValue([{ id: "m_1", name: "Asha Rao", unit: { name: "North" } }]);
    const result = await searchCardPreviewMembers({ organisationSlug: "example-org", query: "  asha " });
    expect(mocks.read).toHaveBeenCalledWith("example-org", ["cards.design", "members.view"]);
    expect(mocks.teamScope).toHaveBeenCalledWith("org_1", { id: "tm_1", unitId: "u_n" });
    const query = mocks.memberFindMany.mock.calls[0][0];
    expect(query.take).toBe(PREVIEW_SEARCH_LIMIT);
    expect(query.where.AND[0]).toEqual({ organisationId: "org_1", AND: [{ unit: { is: { path: "u_n" } } }] });
    expect(query.where.AND[1]).toMatchObject({ anonymisedAt: null, name: { contains: "asha", mode: "insensitive" } });
    expect(Object.keys(query.select).sort()).toEqual(["id", "name", "unit"]);
    expect(result).toEqual({ ok: true, data: { members: [{ id: "m_1", name: "Asha Rao", unitName: "North" }] } });
  });

  it("returns nothing for an empty query and passes refusals through", async () => {
    await expect(searchCardPreviewMembers({ organisationSlug: "example-org", query: "   " })).resolves.toEqual({ ok: true, data: { members: [] } });
    expect(mocks.memberFindMany).not.toHaveBeenCalled();
    mocks.read.mockResolvedValue({ ok: false, error: "Your role doesn't allow this." });
    await expect(searchCardPreviewMembers({ organisationSlug: "example-org", query: "a" })).resolves.toMatchObject({ ok: false });
  });
});

describe("loadCardPreviewHolder", () => {
  const member = {
    id: "m_1", organisationId: "org_1", name: "Asha Rao", photoUrl: `/api/uploads/organisations/org_1/members/m_1/photo-${UUID}.webp`, user: null,
    unit: { id: "u_n", name: "North", code: "N", level: 0, path: "u_n" },
    roles: [{ role: { name: "Secretary" } }],
    terms: [{ id: "t1", planId: "plan_1", status: "ACTIVE", startsAt: new Date("2026-04-01"), endsAt: new Date("2027-04-01"), graceUntil: null, paymentDueBy: null, renewedFromId: null, createdAt: new Date("2026-04-01") }],
    cards: [{ planId: "plan_1", cardNumber: "EX-0042", issuedAt: new Date("2026-04-02") }],
  };

  it("finds the member through the viewer's scope and builds a holder without the real token", async () => {
    mocks.memberFindFirst.mockResolvedValue(member);
    const result = await loadCardPreviewHolder({ organisationSlug: "example-org", planId: "plan_1", roleId: null, memberId: "m_1" });
    const where = mocks.memberFindFirst.mock.calls[0][0].where;
    expect(where.AND[0]).toEqual({ organisationId: "org_1", AND: [{ unit: { is: { path: "u_n" } } }] });
    expect(where.AND[1]).toEqual({ id: "m_1", anonymisedAt: null });
    expect(mocks.memberFindFirst.mock.calls[0][0].select.cards.select).not.toHaveProperty("verifyToken");
    expect(result.ok).toBe(true);
    const holder = result.ok ? result.data!.holder : null;
    expect(holder).toMatchObject({ displayName: "Asha Rao", role: "Secretary", planName: "Annual", idNumber: "EX-0042", verifyToken: PREVIEW_VERIFY_TOKEN, photoUrl: member.photoUrl, units: [{ name: "North", levelName: "Area" }] });
    expect(holder?.details).toEqual([{ key: "blood", label: "Blood group", value: "O+" }]);
  });

  it("is not found for a member outside the scope (or in another organisation)", async () => {
    mocks.memberFindFirst.mockResolvedValue(null);
    await expect(loadCardPreviewHolder({ organisationSlug: "example-org", planId: null, memberId: "m_far" })).resolves.toEqual({ ok: false, error: "Not found." });
  });

  it("is not found when the design's plan or role isn't this organisation's", async () => {
    mocks.findDesignScope.mockResolvedValue(null);
    await expect(loadCardPreviewHolder({ organisationSlug: "example-org", planId: "plan_x", memberId: "m_1" })).resolves.toEqual({ ok: false, error: "Not found." });
    expect(mocks.memberFindFirst).not.toHaveBeenCalled();
  });
});
