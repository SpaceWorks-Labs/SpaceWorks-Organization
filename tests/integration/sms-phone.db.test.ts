import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Phone codes need no email service and no Redis; SMS is set up through the environment, as an install would.
process.env.LOGIN_METHODS = "password,phone";
process.env.SMS_PROVIDER = "twilio";
process.env.TWILIO_ACCOUNT_SID = `AC${"a".repeat(32)}`;
process.env.TWILIO_AUTH_TOKEN = "twilio-token";
process.env.TWILIO_FROM = "+15551234567";
process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.AUTH_SECRET = "integration-secret-integration-secret";
process.env.TRUSTED_PROXY_IP_HEADER = "x-real-ip";
process.env.NEXT_PUBLIC_BASE_URL = "https://swo.example";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "198.51.100.77" }), cookies: async () => ({ get: () => undefined, set: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("next-auth", () => ({ CredentialsSignin: class extends Error { code = "credentials"; } }));
vi.mock("next-auth/providers/credentials", () => ({ default: (options: unknown) => options }));

const { prisma } = await import("@/lib/db");
const { requestSmsCode, checkSmsCode, MAX_ATTEMPTS } = await import("@/lib/sms/codes");
const { parsePhone, phoneHash } = await import("@/lib/sms/phone");
const { startPhoneSignIn } = await import("@/lib/sms/signIn");
const { authorizePhone } = await import("@/lib/authMethods/phone");

const tag = randomUUID().slice(0, 8);
const indian = () => `+919${randomInt(100_000_000, 999_999_999)}`;
const british = () => { for (;;) { const candidate = `+447911${randomInt(100_000, 999_999)}`; if (parsePhone(candidate)) return candidate; } };
const phone = (e164: string) => parsePhone(e164)!;
const userIds: string[] = [];
let ipCounter = 0;
const nextIp = () => `203.0.113.${(ipCounter += 1)}`;

async function makeUser(extra: Record<string, unknown> = {}, number?: string) {
  const user = await prisma.user.create({ data: { email: `phone-${tag}-${userIds.length}@example.test`, emailVerified: new Date(), passwordHash: "x", ...(number ? { phoneE164: number, phoneVerifiedAt: new Date() } : {}), ...extra } });
  userIds.push(user.id);
  return user;
}

/** The code queued for a number: read from the outbox row the way the worker would. */
async function queuedCode(e164: string) {
  const rows = await prisma.outboxMessage.findMany({ where: { kind: "sms-code", payload: { path: ["to"], equals: e164 } }, orderBy: { createdAt: "desc" } });
  return rows[0]?.payload as { codeId: string; code: string; to: string } | undefined;
}

beforeAll(async () => { await prisma.$connect(); });

afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { OR: [{ targetId: { in: userIds } }, { actorUserId: { in: userIds } }] } });
  await prisma.outboxMessage.deleteMany({ where: { kind: "sms-code" } });
  await prisma.smsCode.deleteMany({});
  await prisma.knownDevice.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe.sequential("requesting a code", () => {
  it("stores the code only as a hash, queues the text for an account, and queues nothing for an unknown number", async () => {
    const number = indian();
    const user = await makeUser({}, number);
    expect(await requestSmsCode({ purpose: "SIGN_IN", phone: phone(number), userId: user.id })).toEqual({ ok: true });
    const queued = (await queuedCode(number))!;
    expect(queued.code).toMatch(/^\d{6}$/);
    const row = await prisma.smsCode.findUniqueOrThrow({ where: { id: queued.codeId } });
    expect(row.codeHash).toHaveLength(64);
    expect(JSON.stringify(row)).not.toContain(queued.code);
    expect(JSON.stringify(row)).not.toContain(number.slice(1));
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(10 * 60_000);

    const stranger = indian();
    expect(await requestSmsCode({ purpose: "SIGN_IN", phone: phone(stranger), userId: null })).toEqual({ ok: true });
    expect(await queuedCode(stranger)).toBeUndefined();
    const left = await prisma.smsCode.findFirstOrThrow({ where: { phoneHash: phoneHash(stranger) } });
    expect(left).toMatchObject({ userId: null, codeHash: null });
  });

  it("limits a number to 3 codes in 15 minutes and answers identically for a number with no account", async () => {
    const known = indian();
    const unknown = indian();
    const user = await makeUser({}, known);
    const answers = async (number: string, userId: string | null) => {
      const out = [];
      for (let i = 0; i < 4; i += 1) out.push(await requestSmsCode({ purpose: "SIGN_IN", phone: phone(number), userId }));
      return out;
    };
    const forKnown = await answers(known, user.id);
    const forUnknown = await answers(unknown, null);
    expect(forKnown.map((answer) => answer.ok)).toEqual([true, true, true, false]);
    expect(forUnknown.map((answer) => answer.ok)).toEqual(forKnown.map((answer) => answer.ok));
    const [a, b] = [forKnown[3], forUnknown[3]] as Array<{ ok: false; retryAfterSeconds: number }>;
    expect(Math.abs(a.retryAfterSeconds - b.retryAfterSeconds)).toBeLessThanOrEqual(2);
    expect(a.retryAfterSeconds).toBeGreaterThan(800);
  });

  it("limits a number to 10 codes a day", async () => {
    const number = indian();
    const old = new Date(Date.now() - 60 * 60_000);
    await prisma.smsCode.createMany({ data: Array.from({ length: 10 }, () => ({ purpose: "SIGN_IN", phoneHash: phoneHash(number), country: "91", expiresAt: old, createdAt: old })) });
    const refused = await requestSmsCode({ purpose: "SIGN_IN", phone: phone(number), userId: null });
    expect(refused.ok).toBe(false);
  });

  it("caps a country calling code per day, whether or not the number has an account", async () => {
    const used = await prisma.smsCode.count({ where: { country: "44", createdAt: { gt: new Date(Date.now() - 24 * 3600_000) } } });
    process.env.SMS_DAILY_COUNTRY_CAP = String(used + 2);
    try {
      const user = await makeUser({}, british());
      const first = await requestSmsCode({ purpose: "SIGN_IN", phone: phone(british()), userId: null });
      const second = await requestSmsCode({ purpose: "SIGN_IN", phone: phone(british()), userId: user.id });
      const third = await requestSmsCode({ purpose: "SIGN_IN", phone: phone(british()), userId: null });
      expect([first.ok, second.ok, third.ok]).toEqual([true, true, false]);
    } finally {
      delete process.env.SMS_DAILY_COUNTRY_CAP;
    }
  });
});

describe.sequential("checking a code", () => {
  async function issue() {
    const number = indian();
    const user = await makeUser({}, number);
    await requestSmsCode({ purpose: "SIGN_IN", phone: phone(number), userId: user.id });
    return { number, user, code: (await queuedCode(number))!.code };
  }

  it("is single use", async () => {
    const { number, user, code } = await issue();
    expect(await checkSmsCode({ purpose: "SIGN_IN", phone: phone(number), code, consume: true })).toEqual({ ok: true, userId: user.id });
    expect((await checkSmsCode({ purpose: "SIGN_IN", phone: phone(number), code, consume: true })).ok).toBe(false);
  });
  it("can be checked without being used up, then used", async () => {
    const { number, code } = await issue();
    expect((await checkSmsCode({ purpose: "SIGN_IN", phone: phone(number), code, consume: false })).ok).toBe(true);
    expect((await checkSmsCode({ purpose: "SIGN_IN", phone: phone(number), code, consume: true })).ok).toBe(true);
  });
  it("expires after ten minutes", async () => {
    const { number, code } = await issue();
    const later = new Date(Date.now() + 10 * 60_000 + 1000);
    expect((await checkSmsCode({ purpose: "SIGN_IN", phone: phone(number), code, consume: true, now: later })).ok).toBe(false);
  });
  it("stops after five wrong tries, even for the right code", async () => {
    const { number, code } = await issue();
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) expect((await checkSmsCode({ purpose: "SIGN_IN", phone: phone(number), code: wrong, consume: true })).ok).toBe(false);
    expect((await checkSmsCode({ purpose: "SIGN_IN", phone: phone(number), code, consume: true })).ok).toBe(false);
  });
  it("replaces an earlier code, and refuses a code of the other purpose or for another number", async () => {
    const { number, user, code: first } = await issue();
    await requestSmsCode({ purpose: "SIGN_IN", phone: phone(number), userId: user.id });
    const second = (await queuedCode(number))!.code;
    if (second !== first) expect((await checkSmsCode({ purpose: "SIGN_IN", phone: phone(number), code: first, consume: true })).ok).toBe(false);
    expect((await checkSmsCode({ purpose: "VERIFY", phone: phone(number), code: second, consume: true, userId: user.id })).ok).toBe(false);
    expect((await checkSmsCode({ purpose: "SIGN_IN", phone: phone(indian()), code: second, consume: true })).ok).toBe(false);
    expect((await checkSmsCode({ purpose: "SIGN_IN", phone: phone(number), code: second, consume: true })).ok).toBe(true);
  });
});

describe.sequential("asking for a sign-in code", () => {
  it("gives the same answer for a verified number, an unknown number and a super admin, and refuses a bad number", async () => {
    const known = indian();
    await makeUser({}, known);
    const admin = indian();
    await makeUser({ isSuperAdmin: true }, admin);
    expect(await startPhoneSignIn({ phone: known, ip: nextIp() })).toEqual({ status: 200 });
    expect(await startPhoneSignIn({ phone: indian(), ip: nextIp() })).toEqual({ status: 200 });
    expect(await startPhoneSignIn({ phone: admin, ip: nextIp() })).toEqual({ status: 200 });
    expect(await queuedCode(admin)).toBeUndefined();
    expect(await queuedCode(known)).toBeDefined();
    expect(await startPhoneSignIn({ phone: "12345", ip: nextIp() })).toEqual({ status: 400, error: "invalid_number" });
  });
  it("never texts an unverified number", async () => {
    const number = indian();
    await makeUser({ phoneE164: number, phoneVerifiedAt: null });
    expect(await startPhoneSignIn({ phone: number, ip: nextIp() })).toEqual({ status: 200 });
    expect(await queuedCode(number)).toBeUndefined();
  });
  it("is gone when the method is off", async () => {
    process.env.LOGIN_METHODS = "password";
    try {
      expect(await startPhoneSignIn({ phone: indian(), ip: nextIp() })).toEqual({ status: 404, error: "method_disabled" });
    } finally {
      process.env.LOGIN_METHODS = "password,phone";
    }
  });
  it("limits an address", async () => {
    const ip = nextIp();
    const statuses = [];
    for (let i = 0; i < 11; i += 1) statuses.push((await startPhoneSignIn({ phone: indian(), ip })).status);
    expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe.sequential("signing in with a phone code", () => {
  const request = () => new Request("https://swo.example/api/auth/callback/phone", { headers: { "x-real-ip": nextIp() } });
  const context = { available: ["password", "phone"] } as never;
  const signIn = (number: string, code: string, totp?: string) => authorizePhone({ phone: number, code, ...(totp ? { totp } : {}) }, request(), context).then((value) => value, (error: { code?: string }) => `error:${error.code}`);

  it("signs in only the owner of a verified number, once", async () => {
    const number = indian();
    const user = await makeUser({}, number);
    await startPhoneSignIn({ phone: number, ip: nextIp() });
    const { code } = (await queuedCode(number))!;
    expect(await signIn(number, code === "123456" ? "654321" : "123456")).toBeNull();
    expect(await signIn(number, code)).toMatchObject({ id: user.id });
    expect(await signIn(number, code)).toBeNull();
  });
  it("never creates an account for an unknown number", async () => {
    const number = indian();
    const before = await prisma.user.count();
    await startPhoneSignIn({ phone: number, ip: nextIp() });
    expect(await signIn(number, "123456")).toBeNull();
    expect(await prisma.user.count()).toBe(before);
  });
  it("refuses a super admin whatever the code", async () => {
    const number = indian();
    await makeUser({ isSuperAdmin: true }, number);
    await prisma.smsCode.deleteMany({ where: { phoneHash: phoneHash(number) } });
    expect(await signIn(number, "123456")).toBeNull();
  });
  it("asks an account with an authenticator for its code too, then signs in", async () => {
    const number = indian();
    const { encryptMfaSecret, hashRecoveryCode } = await import("@/lib/mfa");
    const user = await makeUser({ mfaSecretEncrypted: encryptMfaSecret("JBSWY3DPEHPK3PXP"), recoveryCodeHashes: [hashRecoveryCode("abcd-efgh")] }, number);
    await startPhoneSignIn({ phone: number, ip: nextIp() });
    const { code } = (await queuedCode(number))!;
    expect(await signIn(number, code)).toBe("error:mfa_required");
    // A wrong second step fails and leaves the phone code usable; a recovery code then completes the sign-in.
    expect(await signIn(number, code, "wrong-code")).toBeNull();
    expect(await signIn(number, code, "abcd-efgh")).toMatchObject({ id: user.id });
    expect(await signIn(number, code, "abcd-efgh")).toBeNull();
  });
  it("is gone when the method is off", async () => {
    const number = indian();
    await makeUser({}, number);
    expect(await authorizePhone({ phone: number, code: "123456" }, request(), { available: ["password"] } as never).catch((error: { code?: string }) => `error:${error.code}`)).toBe("error:method_disabled");
  });
});
