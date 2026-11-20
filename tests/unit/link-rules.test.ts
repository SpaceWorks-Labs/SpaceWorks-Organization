import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  session: vi.fn(), target: vi.fn(), userFind: vi.fn(), accountFind: vi.fn(), accountCreate: vi.fn(), accountMany: vi.fn(), audit: vi.fn(), failed: vi.fn(), cookieDelete: vi.fn(), count: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ delete: m.cookieDelete }) }));
vi.mock("@/lib/linkSession", () => ({ readRequestSession: m.session, activeLinkTarget: m.target }));
vi.mock("@/lib/authAudit", () => ({ auditIdentityLinked: m.audit, auditSignInFailed: m.failed }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: m.userFind, count: m.count }, account: { findUnique: m.accountFind, create: m.accountCreate, findMany: m.accountMany }, passkey: { count: m.count } } }));
vi.mock("@/lib/loginMethods", () => ({ loadLoginMethods: async () => ({ available: ["password", "google", "oidc"], oidc: [{ id: "work", slug: "work", name: "Work" }], saml: [] }) }));

import { oauthSessionGate } from "@/lib/authMethods/sessionGate";
import { linkExternalIdentity, linkRefusal } from "@/lib/authMethods/link";
import { countWorkingMethods, loginMethodOfProvider, providerAvailable } from "@/lib/authMethods/workingMethods";

beforeEach(() => {
  vi.clearAllMocks();
  m.userFind.mockResolvedValue({ isSuperAdmin: false });
  m.accountFind.mockResolvedValue(null);
  m.target.mockResolvedValue(null);
});

describe("the sign-in session gate", () => {
  it("lets an ordinary sign-in go on when there is no session cookie", async () => {
    m.session.mockResolvedValue({ state: "none" });
    expect(await oauthSessionGate("google", "g1")).toBeUndefined();
  });

  it("turns back a signed-in browser that did not ask to link, and links nothing", async () => {
    m.session.mockResolvedValue({ state: "live", userId: "user_1", sid: "s" });
    expect(await oauthSessionGate("google", "g1")).toBe("/account/security?link=not_requested");
    expect(m.failed).toHaveBeenCalledWith("google", "link_not_requested");
  });

  it("allows a link the browser asked for, for the current user", async () => {
    m.session.mockResolvedValue({ state: "live", userId: "user_1", sid: "s" });
    m.target.mockResolvedValue({ userId: "user_1", sid: "s" });
    expect(await oauthSessionGate("google", "g1")).toBe(true);
  });

  it("refuses an identity that is already linked to another account", async () => {
    m.session.mockResolvedValue({ state: "live", userId: "user_1", sid: "s" });
    m.target.mockResolvedValue({ userId: "user_1", sid: "s" });
    m.accountFind.mockResolvedValue({ userId: "user_2" });
    expect(await oauthSessionGate("google", "g1")).toBe("/account/security?link=identity_linked_elsewhere");
  });

  it("refuses a super admin", async () => {
    m.session.mockResolvedValue({ state: "live", userId: "admin_1", sid: "s" });
    m.target.mockResolvedValue({ userId: "admin_1", sid: "s" });
    m.userFind.mockResolvedValue({ isSuperAdmin: true });
    expect(await oauthSessionGate("google", "g1")).toBe("/account/security?link=super_admin_password_only");
  });

  it("signs in an identity the live user already has as an ordinary sign-in", async () => {
    m.session.mockResolvedValue({ state: "live", userId: "user_1", sid: "s" });
    m.accountFind.mockResolvedValue({ userId: "user_1" });
    expect(await oauthSessionGate("google", "g1")).toBeUndefined();
  });

  it("never links to a session that was revoked: it clears the cookie and asks again", async () => {
    m.session.mockResolvedValue({ state: "stale", userId: "user_1" });
    expect(await oauthSessionGate("google", "g1")).toBe("/login?error=session_expired");
    expect(m.cookieDelete).toHaveBeenCalled();
    m.accountFind.mockResolvedValue({ userId: "user_1" });
    expect(await oauthSessionGate("google", "g1")).toBeUndefined();
  });
});

describe("linking from SAML or a bridge", () => {
  it("links to the user named, and audits it", async () => {
    m.userFind.mockResolvedValueOnce({ isSuperAdmin: false }).mockResolvedValueOnce({ id: "user_1", sessionVersion: 1 });
    const result = await linkExternalIdentity("user_1", "saml-acme", "saml", "sub-1");
    expect(result).toMatchObject({ ok: true, user: { id: "user_1" } });
    expect(m.accountCreate).toHaveBeenCalledWith({ data: { userId: "user_1", type: "saml", provider: "saml-acme", providerAccountId: "sub-1" } });
    expect(m.audit).toHaveBeenCalledWith("user_1", "saml-acme");
  });
  it("refuses an identity linked to someone else, and a super admin", async () => {
    m.accountFind.mockResolvedValue({ userId: "user_2" });
    expect(await linkRefusal("user_1", "supabase", "s")).toBe("identity_linked_elsewhere");
    expect(await linkExternalIdentity("user_1", "supabase", "oidc", "s")).toEqual({ ok: false, code: "identity_linked_elsewhere" });
    expect(m.accountCreate).not.toHaveBeenCalled();
    m.accountFind.mockResolvedValue(null);
    m.userFind.mockResolvedValue({ isSuperAdmin: true });
    expect(await linkRefusal("admin", "supabase", "s")).toBe("super_admin_password_only");
  });
});

describe("working methods", () => {
  it("knows which provider ids belong to which method", () => {
    expect(["google", "oidc-work", "saml-acme", "supabase", "nonsense"].map(loginMethodOfProvider)).toEqual(["google", "oidc", "saml", "supabase", null]);
    const context = { available: ["google", "oidc"], oidc: [{ id: "work", slug: "work" }], saml: [] } as never;
    expect(providerAvailable("google", context)).toBe(true);
    expect(providerAvailable("github", context)).toBe(false);
    expect(providerAvailable("oidc-work", context)).toBe(true);
    expect(providerAvailable("oidc-gone", context)).toBe(false);
  });

  it("counts a password and each available linked identity, and not the one being removed", async () => {
    m.userFind.mockImplementation(async (args: { select: object }) => ("passwordHash" in args.select ? { passwordHash: null, isSuperAdmin: false } : { isSuperAdmin: false }));
    m.accountMany.mockImplementation(async (args: { where: { id?: { not: string } } }) => [{ id: "a", provider: "google" }, { id: "b", provider: "oidc-work" }].filter((row) => row.id !== args.where.id?.not));
    m.count.mockResolvedValue(0);
    expect(await countWorkingMethods("user_1")).toBe(2);
    expect(await countWorkingMethods("user_1", { accountId: "a" })).toBe(1);
    expect(await countWorkingMethods("user_1", { accountId: "a" }, undefined)).toBe(1);
  });

  it("counts a super admin's password only", async () => {
    m.userFind.mockImplementation(async (args: { select: object }) => ("passwordHash" in args.select ? { passwordHash: "h", isSuperAdmin: true } : { isSuperAdmin: true }));
    m.accountMany.mockResolvedValue([{ id: "a", provider: "google" }]);
    expect(await countWorkingMethods("admin")).toBe(1);
  });
});
