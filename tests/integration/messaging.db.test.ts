import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/email/message", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/email/message")>()), sendBrandedEmail: vi.fn(async () => undefined) }));

process.env.AUTH_SECRET ??= "integration-secret-integration-secret-42";
process.env.PAYMENT_SECRETS_KEY ??= randomBytes(32).toString("base64");
process.env.MFA_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");

const { prisma } = await import("@/lib/db");
const { sendBrandedEmail } = await import("@/lib/email/message");
const { encryptChannelConfig } = await import("@/lib/notify/store");
const { completeChallenge, startChallenge, linkEndpoint, liveIdentity, MAX_CODE_ATTEMPTS } = await import("@/lib/notify/endpoints");
const { setConsent } = await import("@/lib/notify/consent");
const { deliverMemberMessage } = await import("@/lib/notify/deliver");
const { queueMemberMessage } = await import("@/lib/notify/send");
const { handleMessagingWebhook } = await import("@/lib/notify/webhooks");
const { saveChannel } = await import("@/lib/notify/channelAdmin");

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const HOOK = "hook-secret-hook-secret";
let orgId: string;
let userId: string;
let memberId: string;
const email = vi.mocked(sendBrandedEmail);
let telegramCalls: string[] = [];

function telegram(status = 200) {
  telegramCalls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body?: string }) => {
    telegramCalls.push(`${url.split("/").pop()}:${init?.body ?? ""}`);
    return new Response(JSON.stringify({ ok: status === 200, result: { message_id: 9 } }), { status });
  }));
}
const route = (routing: unknown, quiet?: { start: number; end: number }) =>
  prisma.orgMessagingSettings.upsert({ where: { organisationId: orgId }, create: { organisationId: orgId, routing: routing as object, quietStartMinute: quiet?.start ?? null, quietEndMinute: quiet?.end ?? null }, update: { routing: routing as object, quietStartMinute: quiet?.start ?? null, quietEndMinute: quiet?.end ?? null } });
const message = (key: string) => ({ organisationId: orgId, memberId, kind: "renewal-due" as const, values: { name: "Asha", organisation: "Kunj", plan: "Annual", validUntil: "31 Mar", payLink: "https://swo.example/account" }, dedupeKey: key });
const webhook = (text: string, secret = HOOK) =>
  handleMessagingWebhook("telegram", new Request("https://swo.example/api/messaging/webhooks/telegram?scope=platform", { method: "POST", headers: { "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify({ message: { text, chat: { id: 5551234, type: "private" } } }) }));

beforeAll(async () => {
  const org = await prisma.organisation.create({ data: { name: "Kunj", slug: `kunj-${suffix}`, status: "ACTIVE", timezone: "Asia/Kolkata" } });
  orgId = org.id;
  const user = await prisma.user.create({ data: { email: `asha-${suffix}@example.test`, name: "Asha", emailVerified: new Date() } });
  userId = user.id;
  memberId = (await prisma.member.create({ data: { organisationId: orgId, userId, email: user.email!, name: "Asha Menon", memberNumber: 1 } })).id;
  await prisma.messagingChannel.create({ data: { organisationId: null, channel: "TELEGRAM", provider: "bot", configEncrypted: encryptChannelConfig({ botToken: "123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", botUsername: "KunjBot", webhookSecret: HOOK }, null) } });
});

afterEach(() => { vi.unstubAllGlobals(); email.mockClear(); });

afterAll(async () => {
  await prisma.messagingChannel.deleteMany({ where: { organisationId: null, channel: "TELEGRAM" } });
  await prisma.outboxMessage.deleteMany({ where: { payload: { path: ["organisationId"], equals: orgId } } });
  await prisma.organisation.delete({ where: { id: orgId } }).catch(() => undefined);
  await prisma.auditEvent.deleteMany({ where: { actorUserId: userId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe.sequential("linking with one-time codes", () => {
  it("links the sender's address once, with the right code", async () => {
    const started = await startChallenge({ userId, scopeOrgId: null, channel: "TELEGRAM" });
    if (!started.ok) throw new Error("no code");
    expect(await completeChallenge({ code: started.code.replace("-", "_").toLowerCase(), scopeOrgId: null, channel: "TELEGRAM", identity: "5551234" })).toEqual({ ok: true, userId });
    expect(await liveIdentity(userId, null, "TELEGRAM")).toBe("5551234");
    // A used code is gone, and an address is stored encrypted, never in the clear.
    expect(await completeChallenge({ code: started.code, scopeOrgId: null, channel: "TELEGRAM", identity: "5551234" })).toMatchObject({ ok: false });
    const row = await prisma.notificationEndpoint.findFirstOrThrow({ where: { userId, revokedAt: null } });
    expect(row.identityEncrypted).not.toContain("5551234");
    expect(row.identityDigest).not.toContain("5551234");
  });

  it("refuses a tampered, expired, wrong-scope or over-tried code", async () => {
    const started = await startChallenge({ userId, scopeOrgId: null, channel: "TELEGRAM" });
    if (!started.ok) throw new Error("no code");
    const [id, secret] = started.code.split("-");
    const wrong = `${id}-${secret.slice(0, 5)}${secret.endsWith("A") ? "B" : "A"}`;
    expect(await completeChallenge({ code: wrong, scopeOrgId: null, channel: "TELEGRAM", identity: "777" })).toEqual({ ok: false, reason: "invalid" });
    expect(await completeChallenge({ code: started.code, scopeOrgId: orgId, channel: "TELEGRAM", identity: "777" })).toEqual({ ok: false, reason: "invalid" });
    expect(await completeChallenge({ code: started.code, scopeOrgId: null, channel: "TELEGRAM", identity: "777", now: new Date(Date.now() + 16 * 60_000) })).toEqual({ ok: false, reason: "expired" });
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) await completeChallenge({ code: wrong, scopeOrgId: null, channel: "TELEGRAM", identity: "777" });
    expect(await completeChallenge({ code: started.code, scopeOrgId: null, channel: "TELEGRAM", identity: "777" })).toEqual({ ok: false, reason: "locked" });
    expect(await liveIdentity(userId, null, "TELEGRAM")).toBe("5551234");
  });

  it("does not let a second person take an address that is already linked", async () => {
    const other = await prisma.user.create({ data: { email: `other-${suffix}@example.test`, name: "Other" } });
    try {
      expect(await linkEndpoint({ userId: other.id, scopeOrgId: null, channel: "TELEGRAM", identity: "5551234" })).toBe(false);
    } finally {
      await prisma.user.delete({ where: { id: other.id } });
    }
  });
});

describe.sequential("the bot's webhook", () => {
  it("answers only requests that carry the secret token", async () => {
    telegram();
    expect((await webhook("STOP", "wrong")).status).toBe(401);
    expect(telegramCalls).toHaveLength(0);
  });

  it("links through /start <code> and replies without repeating the code or the address", async () => {
    await prisma.notificationEndpoint.updateMany({ where: { userId }, data: { revokedAt: new Date() } });
    const started = await startChallenge({ userId, scopeOrgId: null, channel: "TELEGRAM", now: new Date(Date.now() + 1000) });
    if (!started.ok) throw new Error("no code");
    telegram();
    expect((await webhook(`/start ${started.code.replace("-", "_")}`)).status).toBe(200);
    expect(await liveIdentity(userId, null, "TELEGRAM")).toBe("5551234");
    expect(telegramCalls).toHaveLength(1);
    expect(telegramCalls[0]).not.toContain(started.code);
    expect(telegramCalls[0]).not.toContain("5551234:");
  });
});

describe.sequential("routing, consent and delivery", () => {
  it("skips a channel the member has not agreed to, and sends once by email", async () => {
    await route({ "renewal-due": ["TELEGRAM", "EMAIL"] });
    telegram();
    expect(await deliverMemberMessage(message("k-consent"), "<swo-a1@outbox.invalid>")).toBe("sent");
    expect(telegramCalls).toHaveLength(0);
    expect(email).toHaveBeenCalledTimes(1);
  });

  it("sends through the first channel they agreed to and no other", async () => {
    await setConsent(orgId, userId, "TELEGRAM", "OPTED_IN");
    telegram();
    expect(await deliverMemberMessage(message("k-first"), "<swo-a2@outbox.invalid>")).toBe("sent");
    expect(telegramCalls).toHaveLength(1);
    expect(telegramCalls[0]).toContain("Stop these messages: http");
    expect(email).not.toHaveBeenCalled();
  });

  it("falls back to the next channel when one refuses for good, still exactly one message", async () => {
    telegram(403);
    expect(await deliverMemberMessage(message("k-fallback"), "<swo-a3@outbox.invalid>")).toBe("sent");
    expect(telegramCalls).toHaveLength(1);
    expect(email).toHaveBeenCalledTimes(1);
    const log = await prisma.memberMessageLog.findFirstOrThrow({ where: { organisationId: orgId, dedupeKey: "k-fallback" } });
    expect(log).toMatchObject({ status: "SENT", channel: "EMAIL", refused: ["TELEGRAM"] });
  });

  it("retries an outage on the same channel instead of falling back", async () => {
    telegram(500);
    await expect(deliverMemberMessage(message("k-outage"), "<swo-a4@outbox.invalid>")).rejects.toThrow();
    expect(email).not.toHaveBeenCalled();
    telegram();
    expect(await deliverMemberMessage(message("k-outage"), "<swo-a4@outbox.invalid>")).toBe("sent");
    expect(telegramCalls).toHaveLength(1);
  });

  it("delivers a dedupe key once, however often it is offered", async () => {
    telegram();
    await deliverMemberMessage(message("k-once"), "<swo-a5@outbox.invalid>");
    await deliverMemberMessage(message("k-once"), "<swo-a5@outbox.invalid>");
    expect(telegramCalls).toHaveLength(1);
  });

  it("ends consent at once on a STOP reply, and the next message goes by email", async () => {
    telegram();
    expect((await webhook("stop")).status).toBe(200);
    expect(await prisma.messagingConsent.findUnique({ where: { organisationId_userId_channel: { organisationId: orgId, userId, channel: "TELEGRAM" } } })).toMatchObject({ status: "STOPPED" });
    telegramCalls = [];
    await deliverMemberMessage(message("k-after-stop"), "<swo-a6@outbox.invalid>");
    expect(telegramCalls).toHaveLength(0);
    expect(email).toHaveBeenCalledTimes(1);
  });
});

describe.sequential("queueing", () => {
  const queued = (key: string) => prisma.outboxMessage.findMany({ where: { kind: "member-message", payload: { path: ["dedupeKey"], equals: key } } });

  it("queues a message once per dedupe key", async () => {
    await route({});
    await prisma.$transaction((tx) => queueMemberMessage(tx, message("q-once")));
    await prisma.$transaction((tx) => queueMemberMessage(tx, message("q-once")));
    expect(await queued("q-once")).toHaveLength(1);
  });

  it("holds texts and chat messages through quiet hours, never email", async () => {
    await setConsent(orgId, userId, "TELEGRAM", "OPTED_IN");
    await prisma.notificationEndpoint.updateMany({ where: { userId }, data: { revokedAt: new Date() } });
    await linkEndpoint({ userId, scopeOrgId: null, channel: "TELEGRAM", identity: "5551234" });
    // A window covering every moment but one minute: it is always quiet.
    await route({ "renewal-due": ["TELEGRAM"], "renewal-today": ["EMAIL"] }, { start: 0, end: 1439 });
    await prisma.$transaction((tx) => queueMemberMessage(tx, message("q-quiet")));
    await prisma.$transaction((tx) => queueMemberMessage(tx, { ...message("q-email"), kind: "renewal-today" }));
    const [held] = await queued("q-quiet");
    const [mail] = await queued("q-email");
    expect(held.availableAt.getTime()).toBeGreaterThan(Date.now());
    expect(mail.availableAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("queues nothing for a message nobody can receive, and logs it", async () => {
    await route({ "renewal-due": ["WHATSAPP"] });
    await prisma.$transaction((tx) => queueMemberMessage(tx, message("q-nobody")));
    expect(await queued("q-nobody")).toHaveLength(0);
    expect((await prisma.memberMessageLog.findFirstOrThrow({ where: { organisationId: orgId, dedupeKey: "q-nobody" } })).status).toBe("FAILED");
  });
});

describe.sequential("settings", () => {
  it("audits a saved connection by field name only and never stores a secret in the clear", async () => {
    const saved = await saveChannel({ scopeOrgId: orgId, channel: "SLACK", provider: "app", enabled: true, actorUserId: userId, draft: { botToken: "xoxb-test-only-SUPERSECRETTOKEN", signingSecret: "abcdef0123456789abcdef" } });
    expect(saved).toEqual({ ok: true });
    const row = await prisma.messagingChannel.findFirstOrThrow({ where: { organisationId: orgId, channel: "SLACK" } });
    expect(row.configEncrypted).not.toContain("SUPERSECRET");
    const event = await prisma.auditEvent.findFirstOrThrow({ where: { action: "MESSAGING_CHANNEL_SAVED", organisationId: orgId } });
    expect(JSON.stringify(event.metadata)).not.toContain("SUPERSECRET");
    expect(JSON.stringify(event.metadata)).toContain("botToken");
    // Leaving a secret blank keeps it; a bad field is refused with a message per field.
    expect(await saveChannel({ scopeOrgId: orgId, channel: "SLACK", provider: "app", enabled: true, actorUserId: userId, draft: { botToken: "", signingSecret: "" } })).toEqual({ ok: true });
    expect(await saveChannel({ scopeOrgId: orgId, channel: "SLACK", provider: "app", enabled: true, actorUserId: userId, draft: { botToken: "nope" } })).toMatchObject({ ok: false, fieldErrors: { botToken: expect.any(Array) } });
  });
});
