import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The playful-touches switch (app/actions/delight.ts) through the real orgActionAccess and can(): only staff whose
 * role holds org.settings for the whole organisation may change it, only in their own organisation, and every
 * change is audited and drops the organisation's public-page cache.
 */

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  audit: vi.fn(),
  invalidateOrg: vi.fn(),
  revalidatePath: vi.fn(),
  orgFindUnique: vi.fn(),
  orgUpdate: vi.fn(),
  teamMemberFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  orgRoleFindFirst: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: mocks.audit, recordThrottledAuditEvent: mocks.audit }));
vi.mock("@/lib/cache", () => ({ invalidateOrg: mocks.invalidateOrg }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/db", () => ({
  prisma: {
    organisation: { findUnique: mocks.orgFindUnique, update: mocks.orgUpdate },
    teamMember: { findUnique: mocks.teamMemberFindUnique },
    user: { findUnique: mocks.userFindUnique },
    orgRole: { findFirst: mocks.orgRoleFindFirst },
  },
}));

import { setDelightEnabled } from "@/app/actions/delight";

const ORGS: Record<string, { id: string; slug: string; name: string; status: string }> = {
  acme: { id: "org_acme", slug: "acme", name: "Acme Club", status: "ACTIVE" },
  other: { id: "org_other", slug: "other", name: "Other Club", status: "ACTIVE" },
};

const MANAGER = ["org.view", "members.view", "org.settings", "plans.manage"];
const TREASURER = ["org.view", "members.view", "payments.view", "payments.manage", "reports.finance", "accounts.manage"];

/** A team row in Acme only, holding a role with these permissions (optionally limited to one unit). */
function teamRow(capabilities: string[], unitId: string | null = null) {
  mocks.teamMemberFindUnique.mockImplementation(({ where }: { where: { userId_organisationId: { organisationId: string } } }) =>
    Promise.resolve(where.userId_organisationId.organisationId === "org_acme"
      ? { id: "team_1", userId: "user_1", organisationId: "org_acme", role: "MANAGER", roleId: "role_1", unitId, reportDigest: false, createdAt: new Date(0), orgRole: { id: "role_1", isOwner: false, capabilities } }
      : null));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "user_1" } });
  mocks.orgFindUnique.mockImplementation(({ where }: { where: { slug: string } }) => Promise.resolve(ORGS[where.slug] ?? null));
  mocks.orgUpdate.mockResolvedValue({});
  // Not a super admin; has an authenticator.
  mocks.userFindUnique.mockResolvedValue({ isSuperAdmin: false, emailVerified: new Date(), mfaEnabledAt: new Date() });
  mocks.invalidateOrg.mockResolvedValue(undefined);
  teamRow(MANAGER);
});

describe("setDelightEnabled", () => {
  it("lets a role with org.settings turn playful touches off, audited, with the cache dropped", async () => {
    await expect(setDelightEnabled({ organisationSlug: "acme", enabled: false })).resolves.toEqual({ ok: true });
    expect(mocks.orgUpdate).toHaveBeenCalledWith({ where: { id: "org_acme" }, data: { delightEnabled: false } });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "DELIGHT_SET", actorUserId: "user_1", organisationId: "org_acme", targetType: "Organisation", targetId: "org_acme", metadata: { enabled: false },
    }));
    expect(mocks.invalidateOrg).toHaveBeenCalledWith("org_acme", "public-page");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/acme/settings");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/o/acme", "layout");
  });

  it("turns them back on", async () => {
    await expect(setDelightEnabled({ organisationSlug: "acme", enabled: true })).resolves.toEqual({ ok: true });
    expect(mocks.orgUpdate).toHaveBeenCalledWith({ where: { id: "org_acme" }, data: { delightEnabled: true } });
  });

  it("refuses a role without org.settings", async () => {
    teamRow(TREASURER);
    await expect(setDelightEnabled({ organisationSlug: "acme", enabled: false })).resolves.toEqual({ ok: false, error: "Your role doesn't allow this." });
    expect(mocks.orgUpdate).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.invalidateOrg).not.toHaveBeenCalled();
  });

  it("refuses staff limited to a unit, since the switch is organisation-wide", async () => {
    teamRow(MANAGER, "unit_1");
    await expect(setDelightEnabled({ organisationSlug: "acme", enabled: false })).resolves.toEqual({ ok: false, error: "Only staff for the whole organisation can change this." });
    expect(mocks.orgUpdate).not.toHaveBeenCalled();
  });

  it("treats another organisation as not found, and never touches it", async () => {
    await expect(setDelightEnabled({ organisationSlug: "other", enabled: false })).resolves.toEqual({ ok: false, error: "Organisation not found." });
    expect(mocks.orgUpdate).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.invalidateOrg).not.toHaveBeenCalled();
  });

  it("treats an unknown organisation as not found", async () => {
    await expect(setDelightEnabled({ organisationSlug: "missing", enabled: false })).resolves.toEqual({ ok: false, error: "Organisation not found." });
    expect(mocks.orgUpdate).not.toHaveBeenCalled();
  });

  it("needs an authenticator", async () => {
    mocks.userFindUnique.mockResolvedValue({ isSuperAdmin: false, emailVerified: new Date(), mfaEnabledAt: null });
    const result = await setDelightEnabled({ organisationSlug: "acme", enabled: false });
    expect(result.ok).toBe(false);
    expect(mocks.orgUpdate).not.toHaveBeenCalled();
  });

  it("needs a signed-in user and a valid request", async () => {
    await expect(setDelightEnabled({ organisationSlug: "acme", enabled: "no" })).resolves.toEqual({ ok: false, error: "Invalid request." });
    mocks.auth.mockResolvedValue(null);
    await expect(setDelightEnabled({ organisationSlug: "acme", enabled: false })).resolves.toEqual({ ok: false, error: "You must be signed in." });
    expect(mocks.orgUpdate).not.toHaveBeenCalled();
  });
});
