import { beforeEach, describe, expect, it, vi } from "vitest";
import { SoftPasskey } from "../helpers/softPasskey";

const m = vi.hoisted(() => ({
  find: vi.fn(), update: vi.fn(), limited: vi.fn(), wait: vi.fn(), failure: vi.fn(), clear: vi.fn(), failIp: vi.fn(), auditFail: vi.fn(), auditRecovery: vi.fn(), audit: vi.fn(),
  totp: vi.fn(), recovery: vi.fn(), peek: vi.fn(), consume: vi.fn(), discard: vi.fn(), cookie: vi.fn(), remember: vi.fn(), key: vi.fn(),
}));
vi.mock("next-auth", () => ({ CredentialsSignin: class extends Error { code = "credentials"; } }));
vi.mock("next-auth/providers/credentials", () => ({ default: (options: unknown) => options }));
vi.mock("@/lib/db", () => ({ prisma: { passkey: { findUnique: m.find, update: m.update } } }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: m.audit }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: m.limited }));
vi.mock("@/lib/rateLimit", () => ({ getClientIpFromHeaders: () => "203.0.113.7" }));
vi.mock("@/lib/ipBlock", () => ({ isIpBlocked: async () => false, recordFailedLogin: m.failIp }));
vi.mock("@/lib/signInBackoff", () => ({ signInWaitSeconds: m.wait, recordSignInFailure: m.failure, clearSignInFailures: m.clear }));
vi.mock("@/lib/mfa", () => ({ consumeMfaCode: m.totp, consumeRecoveryCode: m.recovery, decryptMfaSecret: () => "seed" }));
vi.mock("@/lib/loginSecurity", () => ({ recognisedDevice: async () => null, rememberDevice: m.remember }));
vi.mock("@/lib/authAudit", () => ({ auditSignInFailed: m.auditFail, auditRecoveryCodeUsed: m.auditRecovery }));
vi.mock("@/lib/passkeys/challenges", () => ({ signInChallengeKey: m.key, peekChallenge: m.peek, consumeChallenge: m.consume, discardChallenge: m.discard, clearSignInCookie: m.cookie }));

import { authorizePasskey } from "@/lib/authMethods/passkey";
import { passkeyRelyingParty } from "@/lib/passkeys/config";

const rp = passkeyRelyingParty();
const challenge = "Y2hhbGxlbmdlLWZvci10ZXN0cw";
const ceremony = { rpID: rp.rpID, origin: rp.origin, challenge };
const context = (state = "available") => ({ statuses: [{ method: "passkey", state }] }) as never;
const request = new Request("https://example.test/api/auth/callback/passkey");
const person = { id: "u1", name: "P", email: "person@example.test", image: null, sessionVersion: 1, emailVerified: new Date(), mfaSecretEncrypted: null as string | null, isSuperAdmin: false, _count: { teamMembers: 0 } };
let key: SoftPasskey;
const row = (over: { counter?: bigint; user?: Partial<typeof person> } = {}) => ({ id: "p1", credentialId: key.id, publicKey: key.publicKey, counter: over.counter ?? BigInt(0), transports: ["internal"], user: { ...person, ...over.user } });
const run = (response: object, extra: Record<string, string> = {}, state = "available") =>
  authorizePasskey({ response: JSON.stringify(response), ...extra }, request, context(state)).then((value) => value, (error: { code?: string }) => `error:${error.code}`);

beforeEach(() => {
  vi.clearAllMocks();
  key = new SoftPasskey();
  m.find.mockResolvedValue(row());
  m.limited.mockResolvedValue(false);
  m.wait.mockResolvedValue(0);
  m.failIp.mockResolvedValue(false);
  m.audit.mockResolvedValue(undefined);
  m.key.mockResolvedValue("sin:abc");
  m.peek.mockResolvedValue(challenge);
  m.consume.mockResolvedValue(true);
  m.totp.mockResolvedValue(false);
  m.recovery.mockResolvedValue(false);
});

describe("passkey sign-in", () => {
  it("signs a member in, updates the counter, uses the challenge up and records the device", async () => {
    expect(await run(key.assert({ ...ceremony, counter: 4 }))).toMatchObject({ id: "u1", sessionVersion: 1 });
    expect(m.consume).toHaveBeenCalledWith("sin:abc");
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p1" }, data: expect.objectContaining({ counter: BigInt(4) }) }));
    expect(m.clear).toHaveBeenCalledWith("person@example.test");
    expect(m.remember).toHaveBeenCalled();
  });
  it("is gone when the method is off: method_disabled before any lookup", async () => {
    expect(await run(key.assert(ceremony), {}, "switched_off")).toBe("error:method_disabled");
    expect(m.find).not.toHaveBeenCalled();
    expect(m.auditFail).toHaveBeenCalledWith("passkey", "method_disabled");
  });
  it("refuses an expired or missing challenge, and an unknown credential, counting both against the address", async () => {
    m.peek.mockResolvedValue(null);
    expect(await run(key.assert(ceremony))).toBeNull();
    expect(m.auditFail).toHaveBeenCalledWith("passkey", "challenge_expired");
    m.peek.mockResolvedValue(challenge);
    m.find.mockResolvedValue(null);
    expect(await run(key.assert(ceremony))).toBeNull();
    expect(m.auditFail).toHaveBeenCalledWith("passkey", "unknown_credential");
    expect(m.failIp).toHaveBeenCalledTimes(2);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("refuses a challenge already used by a racing sign-in", async () => {
    m.consume.mockResolvedValue(false);
    expect(await run(key.assert(ceremony))).toBeNull();
    expect(m.auditFail).toHaveBeenCalledWith("passkey", "challenge_reused");
    expect(m.update).not.toHaveBeenCalled();
  });
  it("refuses a wrong origin, a wrong relying party, no user verification and a forged signature, and drops the challenge", async () => {
    for (const response of [
      key.assert({ ...ceremony, clientOrigin: "https://evil.example" }),
      key.assert({ ...ceremony, rpIDForHash: "evil.example" }),
      key.assert({ ...ceremony, uv: false }),
      key.assert(ceremony, new SoftPasskey()),
    ]) {
      expect(await run(response)).toBeNull();
    }
    expect(m.auditFail).toHaveBeenCalledWith("passkey", "bad_assertion");
    expect(m.discard).toHaveBeenCalledTimes(4);
    expect(m.failure).toHaveBeenCalledWith("person@example.test");
    expect(m.update).not.toHaveBeenCalled();
  });
  it("refuses a counter that went backwards and audits it against the account", async () => {
    m.find.mockResolvedValue(row({ counter: BigInt(9) }));
    expect(await run(key.assert({ ...ceremony, counter: 3 }))).toBeNull();
    expect(m.auditFail).toHaveBeenCalledWith("passkey", "counter_rollback");
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "PASSKEY_COUNTER_ROLLBACK", actorUserId: "u1", targetType: "Passkey" }));
    expect(m.update).not.toHaveBeenCalled();
  });
  it("never signs in a super admin", async () => {
    m.find.mockResolvedValue(row({ user: { isSuperAdmin: true } }));
    expect(await run(key.assert(ceremony))).toBeNull();
    expect(m.auditFail).toHaveBeenCalledWith("passkey", "super_admin_password_only");
  });
  it("respects the per-account delay", async () => {
    m.wait.mockResolvedValue(30);
    expect(await run(key.assert(ceremony))).toBe("error:throttled");
  });
});

describe("passkey sign-in for staff", () => {
  const staff = { mfaSecretEncrypted: "enc", _count: { teamMembers: 1 } };
  it("still asks for the authenticator, keeping the challenge for the second call", async () => {
    m.find.mockResolvedValue(row({ user: staff }));
    expect(await run(key.assert(ceremony))).toBe("error:mfa_required");
    expect(m.consume).not.toHaveBeenCalled();
    expect(m.discard).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });
  it("signs in with a valid code or recovery code, and refuses a wrong one", async () => {
    m.find.mockResolvedValue(row({ user: staff }));
    m.totp.mockResolvedValue(true);
    expect(await run(key.assert(ceremony), { totp: "123456" })).toMatchObject({ id: "u1" });
    m.totp.mockResolvedValue(false);
    m.recovery.mockResolvedValue(true);
    expect(await run(key.assert(ceremony), { totp: "abcd-efgh" })).toMatchObject({ id: "u1" });
    expect(m.auditRecovery).toHaveBeenCalledWith("u1");
    m.recovery.mockResolvedValue(false);
    expect(await run(key.assert(ceremony), { totp: "000000" })).toBeNull();
    expect(m.auditFail).toHaveBeenCalledWith("passkey", "bad_second_step");
  });
  it("lets a member with an authenticator skip it: a verified passkey counts as two steps", async () => {
    m.find.mockResolvedValue(row({ user: { mfaSecretEncrypted: "enc" } }));
    expect(await run(key.assert(ceremony))).toMatchObject({ id: "u1" });
  });
});
