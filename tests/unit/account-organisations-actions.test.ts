import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rateLimit: vi.fn(),
  audit: vi.fn(),
  revalidatePath: vi.fn(),
  orgFindUnique: vi.fn(),
  queryRaw: vi.fn(),
  teamMemberFindUnique: vi.fn(),
  teamMemberCount: vi.fn(),
  teamMemberDeleteMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: mocks.rateLimit }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/db", () => ({
  prisma: {
    organisation: { findUnique: mocks.orgFindUnique },
    $transaction: mocks.transaction,
  },
}));

import { leaveOrganisation } from "@/app/actions/account-organisations";

/** A membership row as the action reads it: the role it holds, and whether that is the Owner role. */
const membership = (roleId: string, isOwner = false) => ({ id: "membership_1", roleId, orgRole: { isOwner } });

const tx = {
  $queryRaw: mocks.queryRaw,
  teamMember: {
    findUnique: mocks.teamMemberFindUnique,
    count: mocks.teamMemberCount,
    deleteMany: mocks.teamMemberDeleteMany,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "user_1" } });
  mocks.rateLimit.mockResolvedValue(false);
  mocks.orgFindUnique.mockResolvedValue({ id: "org_1", slug: "acme" });
  mocks.transaction.mockImplementation((fn: (client: typeof tx) => unknown) => fn(tx));
  mocks.queryRaw.mockResolvedValue([{ id: "org_1" }]);
  mocks.teamMemberFindUnique.mockResolvedValue(membership("role_viewer"));
  mocks.teamMemberCount.mockResolvedValue(1);
  mocks.teamMemberDeleteMany.mockResolvedValue({ count: 1 });
});

describe("leaveOrganisation", () => {
  it("rejects unauthenticated callers before touching the database", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(leaveOrganisation({ organisationSlug: "acme" })).resolves.toEqual({ ok: false, error: "You must be signed in." });
    expect(mocks.orgFindUnique).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("validates input", async () => {
    await expect(leaveOrganisation({ organisationSlug: "" })).resolves.toMatchObject({ ok: false, error: "Invalid input." });
    await expect(leaveOrganisation(null)).resolves.toMatchObject({ ok: false, error: "Invalid input." });
    expect(mocks.orgFindUnique).not.toHaveBeenCalled();
  });

  it("honours the action rate limit for the caller", async () => {
    mocks.rateLimit.mockResolvedValue(true);
    await expect(leaveOrganisation({ organisationSlug: "acme" })).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/too many/i) });
    expect(mocks.rateLimit).toHaveBeenCalledWith("action", "user_1");
    expect(mocks.orgFindUnique).not.toHaveBeenCalled();
    expect(mocks.teamMemberDeleteMany).not.toHaveBeenCalled();
  });

  it("rejects an unknown organisation", async () => {
    mocks.orgFindUnique.mockResolvedValue(null);
    await expect(leaveOrganisation({ organisationSlug: "missing" })).resolves.toEqual({ ok: false, error: "You are not a member of this organisation." });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects a non-member without deleting anything", async () => {
    mocks.teamMemberFindUnique.mockResolvedValue(null);
    await expect(leaveOrganisation({ organisationSlug: "acme" })).resolves.toEqual({ ok: false, error: "You are not a member of this organisation." });
    expect(mocks.teamMemberDeleteMany).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("blocks the sole owner, checking ownership under the organisation lock", async () => {
    mocks.teamMemberFindUnique.mockResolvedValue(membership("role_owner", true));
    mocks.teamMemberCount.mockResolvedValue(1);
    const result = await leaveOrganisation({ organisationSlug: "acme" });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("Transfer ownership or delete the organisation first") });
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.queryRaw.mock.invocationCallOrder[0]).toBeLessThan(mocks.teamMemberCount.mock.invocationCallOrder[0]!);
    expect(mocks.teamMemberCount).toHaveBeenCalledWith({ where: { organisationId: "org_1", orgRole: { isOwner: true } } });
    expect(mocks.teamMemberDeleteMany).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each(["role_viewer", "role_treasurer", "role_manager"])("lets someone holding %s leave without counting owners", async (roleId) => {
    mocks.teamMemberFindUnique.mockResolvedValue(membership(roleId));
    await expect(leaveOrganisation({ organisationSlug: "acme" })).resolves.toEqual({ ok: true });
    expect(mocks.teamMemberCount).not.toHaveBeenCalled();
    expect(mocks.teamMemberDeleteMany).toHaveBeenCalledTimes(1);
  });

  it("lets a co-owner leave when another owner remains", async () => {
    mocks.teamMemberFindUnique.mockResolvedValue(membership("role_owner", true));
    mocks.teamMemberCount.mockResolvedValue(2);
    await expect(leaveOrganisation({ organisationSlug: "acme" })).resolves.toEqual({ ok: true });
    expect(mocks.teamMemberDeleteMany).toHaveBeenCalledTimes(1);
  });

  it("deletes only the caller's own membership and audits it in the same transaction", async () => {
    await expect(leaveOrganisation({ organisationSlug: " acme " })).resolves.toEqual({ ok: true });
    expect(mocks.orgFindUnique).toHaveBeenCalledWith({ where: { slug: "acme" }, select: { id: true, slug: true } });
    expect(mocks.teamMemberFindUnique).toHaveBeenCalledWith({
      where: { userId_organisationId: { userId: "user_1", organisationId: "org_1" } },
      select: { id: true, roleId: true, orgRole: { select: { isOwner: true } } },
    });
    expect(mocks.teamMemberDeleteMany).toHaveBeenCalledWith({ where: { id: "membership_1", userId: "user_1", organisationId: "org_1" } });
    expect(mocks.audit).toHaveBeenCalledWith({
      action: "TEAM_MEMBER_LEFT",
      actorUserId: "user_1",
      organisationId: "org_1",
      targetType: "teamMember",
      targetId: "membership_1",
      metadata: { roleId: "role_viewer" },
      client: tx,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/account/organisations");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/acme");
  });

  it("ignores any extra target identifiers in the input", async () => {
    await leaveOrganisation({ organisationSlug: "acme", targetUserId: "someone_else", userId: "someone_else" });
    expect(mocks.teamMemberFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_organisationId: { userId: "user_1", organisationId: "org_1" } },
    }));
    expect(mocks.teamMemberDeleteMany).toHaveBeenCalledWith({ where: expect.objectContaining({ userId: "user_1" }) });
  });

  it("does not audit or revalidate when the row vanished concurrently", async () => {
    mocks.teamMemberDeleteMany.mockResolvedValue({ count: 0 });
    await expect(leaveOrganisation({ organisationSlug: "acme" })).resolves.toMatchObject({ ok: false });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
