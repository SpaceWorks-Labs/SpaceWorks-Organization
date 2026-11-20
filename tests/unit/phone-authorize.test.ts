import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  user: vi.fn(), check: vi.fn(), limited: vi.fn(), wait: vi.fn(), failure: vi.fn(), clear: vi.fn(), totp: vi.fn(), recovery: vi.fn(),
  known: vi.fn(), remember: vi.fn(), failIp: vi.fn(), auditFail: vi.fn(), auditRecovery: vi.fn(),
}));
vi.mock("next-auth", () => ({ CredentialsSignin: class extends Error { code = "credentials"; } }));
vi.mock("next-auth/providers/credentials", () => ({ default: (options: unknown) => options }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findFirst: m.user } } }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: m.limited }));
vi.mock("@/lib/rateLimit", () => ({ getClientIpFromHeaders: () => "203.0.113.7" }));
vi.mock("@/lib/ipBlock", () => ({ isIpBlocked: async () => false, recordFailedLogin: m.failIp }));
vi.mock("@/lib/signInBackoff", () => ({ signInWaitSeconds: m.wait, recordSignInFailure: m.failure, clearSignInFailures: m.clear }));
vi.mock("@/lib/mfa", () => ({ consumeMfaCode: m.totp, consumeRecoveryCode: m.recovery, decryptMfaSecret: () => "seed" }));
vi.mock("@/lib/loginSecurity", () => ({ recognisedDevice: m.known, rememberDevice: m.remember }));
vi.mock("@/lib/authAudit", () => ({ auditSignInFailed: m.auditFail, auditRecoveryCodeUsed: m.auditRecovery }));
vi.mock("@/lib/sms/codes", () => ({ checkSmsCode: m.check }));

import { authorizePhone } from "@/lib/authMethods/phone";
import { phoneHash } from "@/lib/sms/phone";

process.env.AUTH_SECRET = "s".repeat(40);
const context = (on = true) => ({ available: on ? ["password", "phone"] : ["password"] }) as never;
const request = new Request("https://example.test/api/auth/callback/phone");
const account = { id: "u1", name: "P", email: "person@example.test", image: null, sessionVersion: 1, mfaSecretEncrypted: null, isSuperAdmin: false };
const run = (raw: Record<string, string> = {}, on = true) => authorizePhone({ phone: "+91 98765 43210", code: "123456", ...raw }, request, context(on)).then((value) => value, (error: { code?: string }) => `error:${error.code}`);

beforeEach(() => {
  vi.clearAllMocks();
  m.user.mockResolvedValue(account);
  m.check.mockResolvedValue({ ok: true, userId: "u1" });
  m.limited.mockResolvedValue(false);
  m.wait.mockResolvedValue(0);
  m.known.mockResolvedValue(null);
  m.failIp.mockResolvedValue(false);
  m.totp.mockResolvedValue(false);
  m.recovery.mockResolvedValue(false);
});

describe("phone code sign-in", () => {
  it("signs in a verified number with the right code, and looks only for verified phones", async () => {
    expect(await run()).toMatchObject({ id: "u1", email: "person@example.test", sessionVersion: 1 });
    expect(m.user.mock.calls[0][0].where).toEqual({ phoneE164: "+919876543210", phoneVerifiedAt: { not: null } });
    expect(m.check).toHaveBeenCalledWith({ purpose: "SIGN_IN", phone: { e164: "+919876543210", country: "91" }, code: "123456", consume: true });
    expect(m.clear).toHaveBeenCalledWith(`phone:${phoneHash("+919876543210")}`);
    expect(m.remember).toHaveBeenCalledWith("u1", null);
  });
  it("never creates an account: an unknown number fails the same way as a wrong code, and the code is still checked", async () => {
    m.user.mockResolvedValue(null);
    m.check.mockResolvedValue({ ok: false, userId: null });
    expect(await run()).toBeNull();
    m.user.mockResolvedValue(account);
    expect(await run()).toBeNull();
    expect(m.check).toHaveBeenCalledTimes(2);
    expect(m.failure).toHaveBeenCalledTimes(2);
    expect(m.auditFail).toHaveBeenNthCalledWith(1, "phone", "bad_code");
    expect(m.auditFail).toHaveBeenNthCalledWith(2, "phone", "bad_code");
  });
  it("refuses a code that was issued to a different account", async () => {
    m.check.mockResolvedValue({ ok: true, userId: "someone-else" });
    expect(await run()).toBeNull();
  });
  it("refuses super admins even with a right code", async () => {
    m.user.mockResolvedValue({ ...account, isSuperAdmin: true });
    expect(await run()).toBeNull();
    expect(m.auditFail).toHaveBeenCalledWith("phone", "not_allowed");
    expect(m.remember).not.toHaveBeenCalled();
  });
  it("is gone when the method is off", async () => {
    expect(await run({}, false)).toBe("error:method_disabled");
    expect(m.user).not.toHaveBeenCalled();
    expect(m.check).not.toHaveBeenCalled();
  });
  it("refuses while the per-number delay runs, the same for every number, before any lookup", async () => {
    m.wait.mockResolvedValue(30);
    expect(await run()).toBe("error:throttled");
    expect(m.user).not.toHaveBeenCalled();
    expect(m.auditFail).toHaveBeenCalledWith("phone", "throttled");
  });
  it("returns nothing for input that is not a number with a country code", async () => {
    expect(await run({ phone: "98765 43210" })).toBeNull();
    expect(await run({ code: "x".repeat(40) })).toBeNull();
  });
  it("asks an account with an authenticator for its code without using up the phone code, and signs in once both are right", async () => {
    m.user.mockResolvedValue({ ...account, mfaSecretEncrypted: "enc" });
    expect(await run()).toBe("error:mfa_required");
    expect(m.check).toHaveBeenLastCalledWith(expect.objectContaining({ consume: false }));
    m.totp.mockResolvedValue(true);
    expect(await run({ totp: "654321" })).toMatchObject({ id: "u1" });
    expect(m.check).toHaveBeenLastCalledWith(expect.objectContaining({ consume: true }));
  });
  it("counts a wrong authenticator code as a failure and never uses up the phone code for it", async () => {
    m.user.mockResolvedValue({ ...account, mfaSecretEncrypted: "enc" });
    expect(await run({ totp: "000000" })).toBeNull();
    expect(m.auditFail).toHaveBeenCalledWith("phone", "bad_second_step");
    expect(m.check).toHaveBeenCalledTimes(1);
    m.recovery.mockResolvedValue(true);
    expect(await run({ totp: "abcd-efgh" })).toMatchObject({ id: "u1" });
    expect(m.auditRecovery).toHaveBeenCalledWith("u1");
  });
  it("audits only the method and a reason, never the number or the code", async () => {
    m.check.mockResolvedValue({ ok: false, userId: null });
    await run();
    expect(JSON.stringify(m.auditFail.mock.calls)).not.toMatch(/9876543210|123456/);
    expect(JSON.stringify(m.failure.mock.calls)).not.toContain("9876543210");
  });
});
