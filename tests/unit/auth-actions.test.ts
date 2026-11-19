import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hash: vi.fn(),
  rateLimit: vi.fn(),
  registrationEnabled: vi.fn(),
  userFind: vi.fn(),
  userCreate: vi.fn(),
  transaction: vi.fn(),
  issueVerification: vi.fn(),
  inviteToken: vi.fn(),
}));

vi.mock("bcryptjs", () => ({ default: { hash: mocks.hash } }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: mocks.rateLimit }));
vi.mock("@/lib/inviteSignup", () => ({ inviteSignupToken: mocks.inviteToken, reserveInviteSignup: mocks.inviteToken }));
vi.mock("@/lib/loginMethods", () => ({ availableLoginMethods: async () => ["password"] }));
vi.mock("@/lib/ipBlock", () => ({ currentRequestBlocked: async () => false }));
vi.mock("@/lib/instanceSettings", () => ({ isNewUserRegistrationEnabled: mocks.registrationEnabled }));
vi.mock("@/lib/emailVerification", () => ({
  issueEmailVerification: mocks.issueVerification,
  verifyEmail: vi.fn(),
}));

const tx = { user: { create: mocks.userCreate } };
vi.mock("@/lib/db", () => ({ prisma: {
  user: { findUnique: mocks.userFind },
  $transaction: mocks.transaction,
} }));

import { resendEmailVerification, signUpWithPassword } from "@/app/actions/auth";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.registrationEnabled.mockResolvedValue(true);
  mocks.inviteToken.mockResolvedValue(null);
  mocks.rateLimit.mockResolvedValue(false);
  mocks.hash.mockResolvedValue("password-hash");
  mocks.userFind.mockResolvedValue(null);
  mocks.userCreate.mockResolvedValue({ id: "user_1", email: "person@example.test" });
  mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
});

describe("password account creation", () => {
  it("does not attach a password to an existing OAuth identity", async () => {
    mocks.userFind.mockResolvedValue({ id: "oauth_user", passwordHash: null });
    const result = await signUpWithPassword({ name: "Attacker", email: "person@example.test", password: "new-password" });
    expect(result).toEqual({ ok: true, data: { email: "person@example.test" } });
    expect(mocks.hash).toHaveBeenCalledOnce();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not mislabel a retried account creation as rate-limited", async () => {
    mocks.userFind.mockResolvedValue({ id: "new_user", passwordHash: "hash" });
    mocks.rateLimit.mockResolvedValue(true);

    await expect(signUpWithPassword({ name: "Person", email: "person@example.test", password: "new-password" }))
      .resolves.toEqual({ ok: true, data: { email: "person@example.test" } });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("creates the user and verification outbox record in one transaction", async () => {
    await expect(signUpWithPassword({ name: "Person", email: "PERSON@example.test", password: "new-password" }))
      .resolves.toEqual({ ok: true, data: { email: "person@example.test" } });
    expect(mocks.userCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: { name: "Person", email: "person@example.test", passwordHash: "password-hash" },
    }));
    expect(mocks.issueVerification).toHaveBeenCalledWith({ id: "user_1", email: "person@example.test" }, tx, undefined);
  });

  it("does not touch persistence when instance registration is disabled", async () => {
    mocks.registrationEnabled.mockResolvedValue(false);
    await expect(signUpWithPassword({ name: "Person", email: "person@example.test", password: "new-password" }))
      .resolves.toEqual({ ok: false, error: "New account creation is currently unavailable." });
    expect(mocks.userFind).not.toHaveBeenCalled();
  });

  it("creates an account through a valid invite while registration is off, and returns to it after verifying", async () => {
    const token = "a".repeat(24);
    mocks.registrationEnabled.mockResolvedValue(false);
    mocks.inviteToken.mockResolvedValue(token);
    await expect(signUpWithPassword({ name: "Person", email: "person@example.test", password: "new-password" }))
      .resolves.toEqual({ ok: true, data: { email: "person@example.test" } });
    expect(mocks.inviteToken).toHaveBeenCalledWith("person@example.test");
    expect(mocks.issueVerification).toHaveBeenCalledWith({ id: "user_1", email: "person@example.test" }, tx, `/join/org/${token}`);
  });

  it("keeps resend behavior generic for an unknown account", async () => {
    await expect(resendEmailVerification({ email: "missing@example.test" }))
      .resolves.toEqual({ ok: true, data: { sent: true } });
    expect(mocks.issueVerification).not.toHaveBeenCalled();
  });

  it("uses a verification-specific rate limit for resend requests", async () => {
    await resendEmailVerification({ email: "missing@example.test" });
    expect(mocks.rateLimit).toHaveBeenCalledWith("emailVerification", "missing@example.test");
  });
});
