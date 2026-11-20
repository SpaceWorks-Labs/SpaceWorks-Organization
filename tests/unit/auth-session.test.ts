import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextAuthConfig } from "next-auth";
import type { CredentialsConfig } from "next-auth/providers/credentials";

const mocks = vi.hoisted(() => ({ available: ["password"] as string[], config: null as unknown, find: vi.fn(), accountFind: vi.fn(), compare: vi.fn(), limit: vi.fn(), registrationEnabled: vi.fn(), inviteCookie: vi.fn(), inviteFind: vi.fn(), consume: vi.fn(), recovery: vi.fn(), auditOk: vi.fn(), auditOut: vi.fn(), auditFail: vi.fn(), userUpdate: vi.fn(), startSession: vi.fn(), checkSession: vi.fn(), gate: vi.fn(), linkTarget: vi.fn() }));
vi.mock("next-auth", () => ({
  default: (factory: unknown) => { mocks.config = factory; return {}; },
  CredentialsSignin: class extends Error {},
}));
vi.mock("next-auth/providers/credentials", () => ({ default: (options: unknown) => options }));
vi.mock("@/lib/authAdapter", () => ({ authAdapter: {} }));
vi.mock("@/lib/loginSecurity", () => ({ recognisedDevice: async () => ({ id: "device_1" }), rememberDevice: async () => undefined, issueLoginCode: async () => undefined, consumeLoginCode: async () => true, justVerified: () => true }));
vi.mock("@/lib/userSessions", () => ({ startUserSession: mocks.startSession, checkUserSession: mocks.checkSession }));
vi.mock("@/lib/linkSession", () => ({ activeLinkTarget: mocks.linkTarget, clearLinkIntent: async () => undefined }));
vi.mock("@/lib/authMethods/sessionGate", () => ({ oauthSessionGate: mocks.gate }));
vi.mock("@/lib/ipBlock", () => ({ isIpBlocked: async () => false, recordFailedLogin: async () => false }));
vi.mock("@/lib/rateLimit", () => ({ getClientIpFromHeaders: () => "203.0.113.7" }));
vi.mock("@/lib/signInBackoff", () => ({ signInWaitSeconds: async () => 0, recordSignInFailure: async () => 0, clearSignInFailures: async () => undefined }));
vi.mock("@/lib/emailAvailability", () => ({ isEmailServiceConfigured: async () => true }));
vi.mock("@/lib/authAudit", () => ({ auditSignInFailed: mocks.auditFail, auditSignInSucceeded: mocks.auditOk, auditSignedOut: mocks.auditOut, auditRecoveryCodeUsed: async () => undefined, auditIdentityLinked: async () => undefined }));
vi.mock("@/lib/saml/state", () => ({ consumeSamlTicket: async () => null }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: mocks.find, update: mocks.userUpdate }, account: { findUnique: mocks.accountFind }, teamInvite: { findUnique: mocks.inviteFind, updateMany: async () => ({ count: 1 }) } } }));
vi.mock("@/lib/inviteCookie", () => ({ readInviteCookie: mocks.inviteCookie }));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare } }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: mocks.limit }));
vi.mock("@/lib/mfa", () => ({ consumeMfaCode: mocks.consume, consumeRecoveryCode: mocks.recovery, decryptMfaSecret: () => "synthetic-seed" }));
vi.mock("@/lib/instanceSettings", () => ({ isNewUserRegistrationEnabled: mocks.registrationEnabled }));
vi.mock("@/lib/loginMethods", () => ({ loadLoginMethods: async () => ({
  oauth: { google: null, github: null, apple: null }, available: mocks.available, oidc: [], saml: [],
  statuses: ["password", "saml", "supabase", "firebase"].map((method) => ({ method, state: mocks.available.includes(method) ? "available" : "switched_off" })),
}) }));
vi.mock("@/lib/bridgeSignIn", () => ({ authorizeBridge: async () => null }));
vi.mock("@/lib/oauthProviders", () => ({
  getOAuthSettings: async () => ({ google: null, github: null, apple: null }),
  // Mirrors the real Google rule: only an explicit verified claim counts.
  providerVerifiedEmail: async (_provider: string, profile: { email_verified?: unknown } | null) => profile?.email_verified === true,
}));
import "@/lib/auth";
let config: NextAuthConfig;
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.available = ["password"];
  config = await (mocks.config as () => Promise<NextAuthConfig>)();
  mocks.limit.mockResolvedValue(false);
  mocks.compare.mockResolvedValue(true);
  mocks.find.mockResolvedValue({ id: "user_1", email: "person@example.test", emailVerified: new Date(), passwordHash: "hash", sessionVersion: 2 });
  mocks.accountFind.mockResolvedValue(null);
  mocks.startSession.mockResolvedValue("sid_1");
  mocks.checkSession.mockResolvedValue(2);
  mocks.gate.mockResolvedValue(undefined);
  mocks.linkTarget.mockResolvedValue(null);
  mocks.registrationEnabled.mockResolvedValue(true);
  mocks.inviteCookie.mockResolvedValue(null);
  mocks.inviteFind.mockResolvedValue(null);
});
const jwt = (args: unknown) => config.callbacks!.jwt!(args as Parameters<NonNullable<NonNullable<NextAuthConfig["callbacks"]>["jwt"]>>[0]);
const authorize = (raw: Record<string, string>) => {
  const provider = config.providers[0] as CredentialsConfig;
  return provider.authorize(raw, new Request("https://example.test/api/auth/callback/credentials"));
};
describe("authentication boundary", () => {
  it("limits the normalized account before reading or hashing", async () => {
    mocks.limit.mockResolvedValue(true);
    expect(await authorize({ email: " PERSON@example.test ", password: "password" })).toBeNull();
    expect(mocks.limit).toHaveBeenCalledWith("auth", "person@example.test");
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.compare).not.toHaveBeenCalled();
  });
  it("performs dummy password work for missing identities", async () => {
    mocks.find.mockResolvedValue(null);
    expect(await authorize({ email: "person@example.test", password: "password" })).toBeNull();
    expect(mocks.compare).toHaveBeenCalledOnce();
  });
  it("rejects oversized credentials before expensive work", async () => {
    expect(await authorize({ email: "person@example.test", password: "a".repeat(129) })).toBeNull();
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it("binds successful password proof to its session version", async () => {
    expect(await authorize({ email: "person@example.test", password: "password" })).toMatchObject({ id: "user_1", sessionVersion: 2 });
  });
  it("rejects a login racing credential revocation", async () => {
    expect(await jwt({ token: {}, user: { id: "user_1", sessionVersion: 1 } })).toBeNull();
  });
  it.each([{}, { sessionVersion: 1 }, { sessionVersion: 2, sessionRevoked: true }])("clears stale sessions %j", async (token) => {
    expect(await jwt({ token: { sub: "user_1", sid: "sid_1", ...token } })).toBeNull();
  });
  it("starts a session row on sign-in and keeps its id in the token", async () => {
    const token = await jwt({ token: {}, user: { id: "user_1", sessionVersion: 2 }, account: { provider: "google" } });
    expect(mocks.startSession).toHaveBeenCalledWith("user_1", 2, "google");
    expect(token).toMatchObject({ sub: "user_1", sid: "sid_1", sessionVersion: 2 });
  });
  it("signs out when the session row is missing, revoked or another user's, or the token has no session id", async () => {
    mocks.checkSession.mockResolvedValue(null);
    expect(await jwt({ token: { sub: "user_1", sid: "sid_1", sessionVersion: 2 } })).toBeNull();
    expect(mocks.checkSession).toHaveBeenCalledWith("sid_1", "user_1");
    mocks.checkSession.mockImplementation(async (sid: string | undefined) => (sid ? 2 : null));
    expect(await jwt({ token: { sub: "user_1", sessionVersion: 2 } })).toBeNull();
    expect(await jwt({ token: { sub: "user_1", sid: "sid_1", sessionVersion: 2 } })).toMatchObject({ sid: "sid_1" });
  });
  it("does not let session updates renew authentication freshness", async () => {
    const token = { sub: "user_1", sid: "sid_1", sessionVersion: 2, authenticatedAt: 123 };
    expect(await jwt({ token, trigger: "update", session: { authenticatedAt: Date.now(), sessionVersion: 99 } })).toEqual(token);
  });
  it("refuses password sign-in for everyone but super admins while it is switched off", async () => {
    mocks.available = [];
    config = await (mocks.config as () => Promise<NextAuthConfig>)();
    await expect(authorize({ email: "person@example.test", password: "password" })).rejects.toMatchObject({ code: "method_disabled" });
    mocks.find.mockResolvedValue({ id: "admin_1", email: "admin@example.test", emailVerified: new Date(), passwordHash: "hash", sessionVersion: 1, isSuperAdmin: true });
    expect(await authorize({ email: "admin@example.test", password: "password" })).toMatchObject({ id: "admin_1" });
  });

  it("keeps the credentials-type methods registered so a switched-off one refuses with method_disabled", async () => {
    const providers = () => config.providers as unknown as CredentialsConfig[];
    expect(providers().map((provider) => (provider as unknown as { id: string }).id)).toEqual(["credentials", "saml", "supabase", "firebase", "passkey", "phone"]);
    const request = new Request("https://example.test/api/auth/callback/x");
    for (const id of ["saml", "supabase", "firebase"]) {
      const provider = providers().find((entry) => (entry as unknown as { id: string }).id === id)!;
      await expect(provider.authorize({ token: "t".repeat(40), ticket: "t".repeat(43) }, request)).rejects.toMatchObject({ code: "method_disabled" });
    }
  });

  it("leaves a bridge sign-in to its own verification", async () => {
    const callback = config.callbacks!.signIn!;
    expect(await callback({ user: { email: "a@example.test" }, account: { provider: "firebase", type: "credentials", providerAccountId: "uid" } } as Parameters<typeof callback>[0])).toBe(true);
  });

  it("audits a sign-in by method, a sign-out, and a refused provider identity by reason", async () => {
    await config.events!.signIn!({ user: { id: "user_1" }, account: { provider: "credentials", type: "credentials" } } as never);
    expect(mocks.auditOk).toHaveBeenCalledWith("user_1", "credentials");
    await config.events!.signIn!({ user: { id: "user_1" }, account: { provider: "oidc-work", type: "oidc" } } as never);
    expect(mocks.auditOk).toHaveBeenCalledWith("user_1", "oidc-work");
    await config.events!.signOut!({ token: { sub: "user_1" } } as never);
    expect(mocks.auditOut).toHaveBeenCalledWith("user_1");
    mocks.find.mockResolvedValue({ passwordHash: null, emailVerified: new Date(), isSuperAdmin: true });
    const callback = config.callbacks!.signIn!;
    await callback({ user: { email: "a@example.test" }, account: { provider: "google", providerAccountId: "g" }, profile: { email_verified: true } } as Parameters<typeof callback>[0]);
    expect(mocks.auditFail).toHaveBeenCalledWith("google", "super_admin_password_only");
  });

  describe("OpenID Connect identities", () => {
    const callback = () => config.callbacks!.signIn!;
    const oidc = (profile: object) => callback()({ user: { email: "person@example.test" }, account: { provider: "oidc-work", providerAccountId: "sub-1" }, profile } as Parameters<ReturnType<typeof callback>>[0]);
    it("never links to an existing account by email: link_from_account", async () => {
      await expect(oidc({ email_verified: true })).resolves.toBe("/login?error=link_from_account");
    });
    it("needs a verified email, and signs in an identity already linked to that subject", async () => {
      await expect(oidc({ email_verified: false })).resolves.toBe("/login?error=unverified_email");
      mocks.accountFind.mockResolvedValue({ id: "acc_1", user: { isSuperAdmin: false } });
      await expect(oidc({ email_verified: true })).resolves.toBe(true);
    });
    it("creates a new account only while the creation gate is open", async () => {
      mocks.find.mockResolvedValue(null);
      await expect(oidc({ email_verified: true })).resolves.toBe(true);
      mocks.registrationEnabled.mockResolvedValue(false);
      await expect(oidc({ email_verified: true })).resolves.toBe("/login?error=account_creation_disabled");
    });
    it("refuses a super admin", async () => {
      mocks.find.mockResolvedValue({ passwordHash: "h", emailVerified: new Date(), isSuperAdmin: true });
      await expect(oidc({ email_verified: true })).resolves.toBe("/login?error=super_admin_password_only");
    });
  });

  it("clears deleted users", async () => {
    // The user's session rows go with the user (cascade), so the row is gone.
    mocks.checkSession.mockResolvedValue(null);
    expect(await jwt({ token: { sub: "user_1", sid: "sid_1", sessionVersion: 2 } })).toBeNull();
    mocks.find.mockResolvedValue(null);
    expect(await jwt({ token: {}, user: { id: "user_1" } })).toBeNull();
  });
  it("rejects linking Google to an unverified pre-registered password", async () => {
    mocks.find.mockResolvedValue({ passwordHash: "attacker-hash", emailVerified: null });
    const callback = config.callbacks!.signIn!;
    expect(await callback({ user: { email: "person@example.test" }, account: { provider: "google" }, profile: { email_verified: true } } as Parameters<typeof callback>[0])).toBe(false);
  });

  it("creates an account for a verified new Google identity when registration is enabled", async () => {
    mocks.find.mockResolvedValue(null);
    const callback = config.callbacks!.signIn!;
    await expect(callback({
      user: { email: "new-person@example.test" },
      account: { provider: "google", providerAccountId: "google-user" },
      profile: { email_verified: true },
    } as Parameters<typeof callback>[0])).resolves.toBe(true);
  });

  it("does not send a new Google identity to signup when account creation is disabled", async () => {
    mocks.find.mockResolvedValue(null);
    mocks.registrationEnabled.mockResolvedValue(false);
    const callback = config.callbacks!.signIn!;
    await expect(callback({
      user: { email: "new-person@example.test" },
      account: { provider: "google", providerAccountId: "google-user" },
      profile: { email_verified: true },
    } as Parameters<typeof callback>[0])).resolves.toBe("/login?error=account_creation_disabled");
  });

  describe("new Google identity through a staff invite while account creation is disabled", () => {
    const token = "t".repeat(24);
    const refused = "/login?error=account_creation_disabled";
    const signIn = (email: string) => {
      const callback = config.callbacks!.signIn!;
      return callback({ user: { email }, account: { provider: "google", providerAccountId: "google-user" }, profile: { email_verified: true } } as Parameters<typeof callback>[0]);
    };
    const open = (overrides: Record<string, unknown> = {}) => ({ email: null, usedAt: null, expiresAt: new Date(Date.now() + 60_000), ...overrides });
    beforeEach(() => {
      mocks.find.mockResolvedValue(null);
      mocks.registrationEnabled.mockResolvedValue(false);
    });

    it("allows the account through a valid, unused invite the browser started from", async () => {
      mocks.inviteCookie.mockResolvedValue(token);
      mocks.inviteFind.mockResolvedValue(open());
      await expect(signIn("new-person@example.test")).resolves.toBe(true);
      expect(mocks.inviteFind).toHaveBeenCalledWith(expect.objectContaining({ where: { token } }));
    });

    it("refuses without the invite cookie", async () => {
      await expect(signIn("new-person@example.test")).resolves.toBe(refused);
      expect(mocks.inviteFind).not.toHaveBeenCalled();
    });

    it.each([
      ["used", open({ usedAt: new Date() })],
      ["expired", open({ expiresAt: new Date(Date.now() - 1000) })],
      ["revoked", null],
    ])("refuses a %s invite", async (_name, row) => {
      mocks.inviteCookie.mockResolvedValue(token);
      mocks.inviteFind.mockResolvedValue(row);
      await expect(signIn("new-person@example.test")).resolves.toBe(refused);
    });

    it("accepts only the bound email on an email-bound invite", async () => {
      mocks.inviteCookie.mockResolvedValue(token);
      mocks.inviteFind.mockResolvedValue(open({ email: "Bound@Example.test" }));
      await expect(signIn("bound@example.test")).resolves.toBe(true);
      await expect(signIn("other@example.test")).resolves.toBe("/login?error=invite_email_mismatch");
    });
  });
});
