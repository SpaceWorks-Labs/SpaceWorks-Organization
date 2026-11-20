import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyFirebase: vi.fn(), verifySupabase: vi.fn(), blocked: vi.fn(), fail: vi.fn(), limited: vi.fn(),
  userFind: vi.fn(), userCreate: vi.fn(), userUpdate: vi.fn(), accountFind: vi.fn(), accountCreate: vi.fn(),
  registrationEnabled: vi.fn(), inviteCookie: vi.fn(), inviteFind: vi.fn(), remember: vi.fn(),
}));
vi.mock("next-auth", () => ({ CredentialsSignin: class extends Error { code = "credentials"; } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/bridgeTokens", () => ({ verifyFirebaseIdToken: mocks.verifyFirebase, verifySupabaseToken: mocks.verifySupabase }));
vi.mock("@/lib/linkSession", () => ({ activeLinkTarget: async () => null }));
vi.mock("@/lib/ipBlock", () => ({ isIpBlocked: mocks.blocked, recordFailedLogin: mocks.fail }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: mocks.limited }));
vi.mock("@/lib/rateLimit", () => ({ getClientIpFromHeaders: () => "203.0.113.7" }));
vi.mock("@/lib/loginSecurity", () => ({ recognisedDevice: async () => null, rememberDevice: mocks.remember }));
vi.mock("@/lib/instanceSettings", () => ({ isNewUserRegistrationEnabled: mocks.registrationEnabled }));
vi.mock("@/lib/inviteCookie", () => ({ readInviteCookie: mocks.inviteCookie }));
vi.mock("@/lib/db", () => ({ prisma: {
  user: { findUnique: mocks.userFind, create: mocks.userCreate, update: mocks.userUpdate },
  account: { findUnique: mocks.accountFind, create: mocks.accountCreate },
  teamInvite: { findUnique: mocks.inviteFind, updateMany: async () => ({ count: 1 }) },
  $transaction: async (run: (tx: unknown) => unknown) => run({ user: { create: mocks.userCreate }, account: { create: mocks.accountCreate } }),
} }));

import { authorizeBridge } from "@/lib/bridgeSignIn";

const request = new Request("https://example.test/api/auth/callback/firebase");
const token = { token: "t".repeat(40) };
const identity = { sub: "uid-1", email: "person@example.test", name: "Person" };
const existing = { id: "user_1", name: "Person", email: "person@example.test", image: null, sessionVersion: 3, emailVerified: new Date(), isSuperAdmin: false, passwordHash: null };
const code = (promise: Promise<unknown>) => promise.then(() => "resolved", (error: { code?: string }) => error.code);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AUTH_FIREBASE_API_KEY", "AIzaSyExampleKey123");
  vi.stubEnv("AUTH_FIREBASE_AUTH_DOMAIN", "demo-project.firebaseapp.com");
  vi.stubEnv("AUTH_FIREBASE_PROJECT_ID", "demo-project");
  vi.stubEnv("AUTH_SUPABASE_URL", "https://abc.supabase.co");
  vi.stubEnv("AUTH_SUPABASE_ANON_KEY", "anon");
  mocks.verifyFirebase.mockResolvedValue({ ok: true, identity });
  mocks.verifySupabase.mockResolvedValue({ ok: true, identity });
  mocks.blocked.mockResolvedValue(false);
  mocks.fail.mockResolvedValue(false);
  mocks.limited.mockResolvedValue(false);
  mocks.userFind.mockResolvedValue(existing);
  mocks.accountFind.mockResolvedValue(null);
  mocks.userCreate.mockResolvedValue({ ...existing, id: "user_new" });
  mocks.registrationEnabled.mockResolvedValue(true);
  mocks.inviteCookie.mockResolvedValue(null);
  mocks.inviteFind.mockResolvedValue(null);
});

describe("bridge sign-in rules", () => {
  it("never links to an existing account by email (the provider may have confirmed an address it never checked)", async () => {
    expect(await code(authorizeBridge("firebase", token, request))).toBe("bridge_link_refused");
    expect(mocks.accountCreate).not.toHaveBeenCalled();
    expect(mocks.userCreate).not.toHaveBeenCalled();
    expect(mocks.remember).not.toHaveBeenCalled();
  });
  it("signs in through an account already linked by sub without linking again", async () => {
    mocks.accountFind.mockResolvedValue({ user: existing });
    await authorizeBridge("supabase", token, request);
    expect(mocks.accountCreate).not.toHaveBeenCalled();
    expect(mocks.verifySupabase).toHaveBeenCalled();
  });
  it("refuses super admins", async () => {
    mocks.userFind.mockResolvedValue({ ...existing, isSuperAdmin: true });
    expect(await code(authorizeBridge("firebase", token, request))).toBe("super_admin_password_only");
    expect(mocks.accountCreate).not.toHaveBeenCalled();
  });
  it("refuses to link to an unverified password account", async () => {
    mocks.userFind.mockResolvedValue({ ...existing, passwordHash: "hash", emailVerified: null });
    expect(await code(authorizeBridge("firebase", token, request))).toBe("bridge_failed");
  });
  describe("a new identity", () => {
    beforeEach(() => mocks.userFind.mockResolvedValue(null));
    it("creates a verified user and its account while sign-ups are on", async () => {
      await expect(authorizeBridge("firebase", token, request)).resolves.toMatchObject({ id: "user_new" });
      expect(mocks.userCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ email: "person@example.test", emailVerified: expect.any(Date) }) }));
      expect(mocks.accountCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "user_new", providerAccountId: "uid-1" }) });
    });
    it("is refused while sign-ups are off and there is no invite", async () => {
      mocks.registrationEnabled.mockResolvedValue(false);
      expect(await code(authorizeBridge("firebase", token, request))).toBe("account_creation_disabled");
      expect(mocks.userCreate).not.toHaveBeenCalled();
    });
    it("is allowed through an open invite the browser started from", async () => {
      mocks.registrationEnabled.mockResolvedValue(false);
      mocks.inviteCookie.mockResolvedValue("tok");
      mocks.inviteFind.mockResolvedValue({ email: null, usedAt: null, expiresAt: new Date(Date.now() + 60_000) });
      await expect(authorizeBridge("firebase", token, request)).resolves.toMatchObject({ id: "user_new" });
    });
    it("names an invite bound to another email", async () => {
      mocks.registrationEnabled.mockResolvedValue(false);
      mocks.inviteCookie.mockResolvedValue("tok");
      mocks.inviteFind.mockResolvedValue({ email: "other@example.test", usedAt: null, expiresAt: new Date(Date.now() + 60_000) });
      expect(await code(authorizeBridge("firebase", token, request))).toBe("invite_email_mismatch");
    });
  });
  it("maps token refusals to codes and counts only invalid tokens as failed sign-ins", async () => {
    mocks.verifyFirebase.mockResolvedValue({ ok: false, reason: "unverified_email" });
    expect(await code(authorizeBridge("firebase", token, request))).toBe("unverified_email");
    mocks.verifyFirebase.mockResolvedValue({ ok: false, reason: "no_email" });
    expect(await code(authorizeBridge("firebase", token, request))).toBe("bridge_no_email");
    expect(mocks.fail).not.toHaveBeenCalled();
    mocks.verifyFirebase.mockResolvedValue({ ok: false, reason: "invalid_token" });
    expect(await code(authorizeBridge("firebase", token, request))).toBe("bridge_failed");
    expect(mocks.fail).toHaveBeenCalledOnce();
  });
  it("blocks a blocked address, rate-limits, and rejects malformed input before verifying", async () => {
    mocks.blocked.mockResolvedValue(true);
    expect(await code(authorizeBridge("firebase", token, request))).toBe("address_blocked");
    mocks.blocked.mockResolvedValue(false);
    mocks.limited.mockResolvedValue(true);
    expect(await authorizeBridge("firebase", token, request)).toBeNull();
    mocks.limited.mockResolvedValue(false);
    expect(await authorizeBridge("firebase", { token: "short" }, request)).toBeNull();
    expect(mocks.verifyFirebase).not.toHaveBeenCalled();
  });
  it("is unavailable when the bridge is not configured", async () => {
    vi.stubEnv("AUTH_FIREBASE_PROJECT_ID", "");
    expect(await code(authorizeBridge("firebase", token, request))).toBe("bridge_unavailable");
  });
});
