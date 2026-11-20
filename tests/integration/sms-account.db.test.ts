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
const { requestSmsCode } = await import("@/lib/sms/codes");
const { parsePhone } = await import("@/lib/sms/phone");
const { confirmPhone, removePhone, startPhoneVerification } = await import("@/lib/sms/account");
const { deliverOutboxBatch } = await import("@/lib/outbox");

const tag = randomUUID().slice(0, 8);
const indian = () => `+919${randomInt(100_000_000, 999_999_999)}`;
const phone = (e164: string) => parsePhone(e164)!;
const userIds: string[] = [];

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

describe.sequential("adding and removing a phone on the account", () => {
  it("verifies a number with a texted code, saves it, and audits without the number", async () => {
    const user = await makeUser();
    const number = indian();
    expect(await startPhoneVerification(user.id, number)).toEqual({ ok: true });
    const { code } = (await queuedCode(number))!;
    expect(await confirmPhone(user.id, number, code === "000000" ? "111111" : "000000")).toMatchObject({ ok: false });
    expect(await confirmPhone(user.id, number, code)).toEqual({ ok: true });
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(saved.phoneE164).toBe(number);
    expect(saved.phoneVerifiedAt).not.toBeNull();
    const events = await prisma.auditEvent.findMany({ where: { actorUserId: user.id } });
    expect(events.map((event) => event.action)).toContain("PHONE_ADDED");
    expect(JSON.stringify(events)).not.toContain(number.slice(3));
  });
  it("refuses a code asked for by someone else, and a number already verified on another account", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const number = indian();
    await startPhoneVerification(owner.id, number);
    const { code } = (await queuedCode(number))!;
    expect(await confirmPhone(other.id, number, code)).toMatchObject({ ok: false });
    expect(await confirmPhone(owner.id, number, code)).toEqual({ ok: true });
    await startPhoneVerification(other.id, number);
    const again = (await queuedCode(number))!;
    expect(await confirmPhone(other.id, number, again.code)).toEqual({ ok: false, error: "This number can't be added to your account." });
  });
  it("refuses super admins", async () => {
    const admin = await makeUser({ isSuperAdmin: true });
    expect(await startPhoneVerification(admin.id, indian())).toMatchObject({ ok: false });
  });
  it("refuses to remove the last working way to sign in, and removes otherwise, auditing without the number", async () => {
    const number = indian();
    const phoneOnly = await makeUser({ passwordHash: null }, number);
    expect(await removePhone(phoneOnly.id)).toEqual({ ok: false, error: "Add another way to sign in before removing your phone." });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: phoneOnly.id } })).phoneE164).toBe(number);
    const withPassword = await makeUser({}, indian());
    expect(await removePhone(withPassword.id)).toEqual({ ok: true });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: withPassword.id } });
    expect(after).toMatchObject({ phoneE164: null, phoneVerifiedAt: null });
    const events = await prisma.auditEvent.findMany({ where: { actorUserId: withPassword.id, action: "PHONE_REMOVED" } });
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0].metadata ?? {})).not.toMatch(/\+?\d{8}/);
  });
});

describe.sequential("sending through the outbox", () => {
  it("sends a code once, stores the provider id, deletes the row, and never sends again after acceptance", async () => {
    const number = indian();
    const user = await makeUser({}, number);
    // Earlier files leave rows behind; a batch takes the oldest 20, so start from an empty outbox.
    await prisma.outboxMessage.deleteMany({});
    await requestSmsCode({ purpose: "SIGN_IN", phone: phone(number), userId: user.id });
    const queued = (await queuedCode(number))!;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ sid: "SMintegration1" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await deliverOutboxBatch();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = new URLSearchParams((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
      expect(body.get("To")).toBe(number);
      expect(body.get("Body")).toBe(`${queued.code} is your Space Works Organization code.`);
      expect(body.get("StatusCallback")).toBe("https://swo.example/api/sms/webhooks/twilio");
      const row = await prisma.smsCode.findUniqueOrThrow({ where: { id: queued.codeId } });
      expect(row).toMatchObject({ providerRef: "SMintegration1", deliveryState: "sent" });
      expect(await prisma.outboxMessage.count({ where: { kind: "sms-code", payload: { path: ["codeId"], equals: queued.codeId } } })).toBe(0);
      // The same row delivered again (a crash before cleanup) sends nothing.
      await prisma.outboxMessage.create({ data: { kind: "sms-code", payload: { codeId: queued.codeId, to: number, code: queued.code, expiresAt: new Date(Date.now() + 60_000).toISOString() } } });
      await deliverOutboxBatch();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(await prisma.outboxMessage.count({ where: { kind: "sms-code", payload: { path: ["codeId"], equals: queued.codeId } } })).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
