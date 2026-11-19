import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  user: vi.fn(), compare: vi.fn(), limited: vi.fn(), wait: vi.fn(), failure: vi.fn(), clear: vi.fn(), email: vi.fn(),
  totp: vi.fn(), recovery: vi.fn(), consumeCode: vi.fn(), issue: vi.fn(), known: vi.fn(), failIp: vi.fn(), auditFail: vi.fn(), auditRecovery: vi.fn(),
}));
vi.mock("next-auth", () => ({ CredentialsSignin: class extends Error { code = "credentials"; } }));
vi.mock("next-auth/providers/credentials", () => ({ default: (options: unknown) => options }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: m.user } } }));
vi.mock("bcryptjs", () => ({ default: { compare: m.compare } }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: m.limited }));
vi.mock("@/lib/rateLimit", () => ({ getClientIpFromHeaders: () => "203.0.113.7" }));
vi.mock("@/lib/ipBlock", () => ({ isIpBlocked: async () => false, recordFailedLogin: m.failIp }));
vi.mock("@/lib/signInBackoff", () => ({ signInWaitSeconds: m.wait, recordSignInFailure: m.failure, clearSignInFailures: m.clear }));
vi.mock("@/lib/emailAvailability", () => ({ isEmailServiceConfigured: m.email }));
vi.mock("@/lib/mfa", () => ({ consumeMfaCode: m.totp, consumeRecoveryCode: m.recovery, decryptMfaSecret: () => "seed" }));
vi.mock("@/lib/loginSecurity", () => ({ recognisedDevice: m.known, rememberDevice: async () => undefined, issueLoginCode: m.issue, consumeLoginCode: m.consumeCode, justVerified: () => false }));
vi.mock("@/lib/authAudit", () => ({ auditSignInFailed: m.auditFail, auditRecoveryCodeUsed: m.auditRecovery }));

import { authorizePassword } from "@/lib/authMethods/password";

const context = (off = false) => ({ statuses: [{ method: "password", state: off ? "switched_off" : "available" }] }) as never;
const request = new Request("https://example.test/api/auth/callback/credentials");
const account = { id: "u1", name: "P", email: "person@example.test", image: null, passwordHash: "h", sessionVersion: 1, emailVerified: new Date(Date.now() - 86_400_000), mfaSecretEncrypted: null, isSuperAdmin: false };
const run = (raw: Record<string, string> = {}, off = false) => authorizePassword({ email: "person@example.test", password: "pw", ...raw }, request, context(off)).then((value) => value, (error: { code?: string }) => `error:${error.code}`);

beforeEach(() => {
  vi.clearAllMocks();
  m.user.mockResolvedValue(account);
  m.compare.mockResolvedValue(true);
  m.limited.mockResolvedValue(false);
  m.wait.mockResolvedValue(0);
  m.email.mockResolvedValue(true);
  m.known.mockResolvedValue(null);
  m.failIp.mockResolvedValue(false);
  m.totp.mockResolvedValue(false);
  m.recovery.mockResolvedValue(false);
  m.consumeCode.mockResolvedValue(false);
});

describe("password sign-in throttling and audit", () => {
  it("refuses while the delay is running, before any lookup or hashing, and says the same for unknown accounts", async () => {
    m.wait.mockResolvedValue(30);
    expect(await run()).toBe("error:throttled");
    m.user.mockResolvedValue(null);
    expect(await run({ email: "nobody@example.test" })).toBe("error:throttled");
    expect(m.user).not.toHaveBeenCalled();
    expect(m.compare).not.toHaveBeenCalled();
    expect(m.auditFail).toHaveBeenCalledWith("password", "throttled");
  });
  it("counts a wrong password against the address, known or not, and audits the method and reason only", async () => {
    m.compare.mockResolvedValue(false);
    expect(await run()).toBeNull();
    m.user.mockResolvedValue(null);
    expect(await run({ email: "nobody@example.test" })).toBeNull();
    expect(m.failure).toHaveBeenCalledTimes(2);
    expect(m.failure).toHaveBeenNthCalledWith(1, "person@example.test");
    expect(m.failure).toHaveBeenNthCalledWith(2, "nobody@example.test");
    expect(m.auditFail).toHaveBeenCalledWith("password", "bad_credentials");
    expect(JSON.stringify(m.auditFail.mock.calls)).not.toContain("pw");
  });
  it("clears the failures after a correct sign-in", async () => {
    m.email.mockResolvedValue(false);
    expect(await run()).toMatchObject({ id: "u1" });
    expect(m.clear).toHaveBeenCalledWith("person@example.test");
  });
  it("refuses with method_disabled when password is off, except for super admins", async () => {
    expect(await run({}, true)).toBe("error:method_disabled");
    m.user.mockResolvedValue({ ...account, isSuperAdmin: true });
    m.email.mockResolvedValue(false);
    expect(await run({}, true)).toMatchObject({ id: "u1" });
  });
  it("audits a recovery code as used, and counts a wrong second step as a failure", async () => {
    m.user.mockResolvedValue({ ...account, mfaSecretEncrypted: "enc" });
    expect(await run({})).toBe("error:mfa_required");
    m.recovery.mockResolvedValue(true);
    expect(await run({ totp: "abcd-efgh" })).toMatchObject({ id: "u1" });
    expect(m.auditRecovery).toHaveBeenCalledWith("u1");
    m.recovery.mockResolvedValue(false);
    expect(await run({ totp: "000000" })).toBeNull();
    expect(m.auditFail).toHaveBeenCalledWith("password", "bad_second_step");
  });
});

describe("without an email service", () => {
  it("asks for an emailed code on a new browser when email works", async () => {
    expect(await run()).toBe("error:email_code_required");
    expect(m.issue).toHaveBeenCalled();
  });
  it("does not ask for or send an emailed code when no email service is set up, so nobody is locked out", async () => {
    m.email.mockResolvedValue(false);
    expect(await run()).toMatchObject({ id: "u1" });
    expect(m.issue).not.toHaveBeenCalled();
  });
});
