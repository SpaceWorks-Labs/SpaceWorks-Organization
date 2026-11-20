import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createMany: vi.fn(), count: vi.fn(), orgSettings: vi.fn(), settings: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { emailSuppression: { createMany: mocks.createMany, count: mocks.count }, orgEmailSettings: { findUnique: mocks.orgSettings } } }));
vi.mock("@/lib/instanceSettings", () => ({ getEmailSettings: mocks.settings }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: mocks.audit }));

import { postmarkEntries, resendEntries, sesEntries } from "@/lib/email/webhooks/events";
import { handleEmailWebhook } from "@/lib/email/webhooks/handle";
import { verifyBasicAuth, verifySns, verifySvix, type SnsMessage } from "@/lib/email/webhooks/verify";
import { EmailSuppressedError, withSuppression } from "@/lib/email/suppression";

const SECRET = Buffer.from("a-signing-secret-for-tests-only!").toString("base64");
const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);

function svixHeaders(body: string, options: { secret?: string; timestamp?: number; id?: string } = {}) {
  const id = options.id ?? "msg_1";
  const timestamp = String(options.timestamp ?? Math.floor(NOW / 1000));
  const signature = crypto.createHmac("sha256", Buffer.from(options.secret ?? SECRET, "base64")).update(`${id}.${timestamp}.${body}`).digest("base64");
  return { id, timestamp, signature: `v1,${signature}` };
}

describe("Svix signatures (Resend)", () => {
  const body = JSON.stringify({ type: "email.bounced" });

  it("accepts a valid signature, including one of several entries", () => {
    const headers = svixHeaders(body);
    expect(verifySvix(`whsec_${SECRET}`, headers, body, NOW)).toBe(true);
    expect(verifySvix(SECRET, { ...headers, signature: `v1,AAAA ${headers.signature}` }, body, NOW)).toBe(true);
  });

  it("refuses a tampered body, a wrong secret and missing headers", () => {
    const headers = svixHeaders(body);
    expect(verifySvix(SECRET, headers, body.replace("bounced", "complained"), NOW)).toBe(false);
    expect(verifySvix(Buffer.from("another-secret").toString("base64"), headers, body, NOW)).toBe(false);
    expect(verifySvix(SECRET, { ...headers, signature: null }, body, NOW)).toBe(false);
    expect(verifySvix("", headers, body, NOW)).toBe(false);
  });

  it("refuses a replayed or future-dated request outside five minutes", () => {
    const old = svixHeaders(body, { timestamp: Math.floor(NOW / 1000) - 600 });
    expect(verifySvix(SECRET, old, body, NOW)).toBe(false);
    const future = svixHeaders(body, { timestamp: Math.floor(NOW / 1000) + 600 });
    expect(verifySvix(SECRET, future, body, NOW)).toBe(false);
    expect(verifySvix(SECRET, svixHeaders(body, { timestamp: Math.floor(NOW / 1000) - 200 }), body, NOW)).toBe(true);
  });
});

describe("basic auth (Postmark)", () => {
  const header = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
  it("compares only the password with the saved secret", () => {
    expect(verifyBasicAuth("s3cret", header("anything", "s3cret"))).toBe(true);
    expect(verifyBasicAuth("s3cret", header("anything", "s3cret!"))).toBe(false);
    expect(verifyBasicAuth("s3cret", null)).toBe(false);
    expect(verifyBasicAuth("", header("a", ""))).toBe(false);
    expect(verifyBasicAuth("s3cret", "Bearer s3cret")).toBe(false);
  });
});

describe("SNS signatures (Amazon SES)", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const TOPIC = "arn:aws:sns:eu-west-1:123456789012:ses-reports";

  function signed(overrides: Partial<SnsMessage> = {}): SnsMessage {
    const base = { Type: "Notification", MessageId: "m1", TopicArn: TOPIC, Message: "{}", Timestamp: new Date(NOW).toISOString(), SignatureVersion: "2", SigningCertURL: "https://sns.eu-west-1.amazonaws.com/cert.pem", ...overrides };
    const canonical = ["Message", "MessageId", "Timestamp", "TopicArn", "Type"].map((name) => `${name}\n${(base as Record<string, string>)[name]}\n`).join("");
    return { ...base, Signature: crypto.createSign("RSA-SHA256").update(canonical).sign(privateKey, "base64") } as SnsMessage;
  }
  const options = { topicArn: TOPIC, now: NOW, fetchCertificate: async () => pem };

  it("accepts a message signed by the certificate from the pinned topic", async () => {
    expect(await verifySns(signed(), options)).toBe(true);
  });

  it("refuses a tampered message, another topic, an unpinned install and an old timestamp", async () => {
    expect(await verifySns({ ...signed(), Message: '{"x":1}' }, options)).toBe(false);
    expect(await verifySns(signed({ TopicArn: "arn:aws:sns:eu-west-1:999999999999:theirs" }), options)).toBe(false);
    expect(await verifySns(signed(), { ...options, topicArn: "" })).toBe(false);
    expect(await verifySns(signed({ Timestamp: new Date(NOW - 2 * 3600_000).toISOString() }), options)).toBe(false);
  });

  it("refuses a certificate that does not come from an Amazon SNS host, and a bad signature", async () => {
    const fetchCertificate = vi.fn(async () => pem);
    expect(await verifySns(signed({ SigningCertURL: "https://evil.example.com/cert.pem" }), { ...options, fetchCertificate })).toBe(false);
    expect(await verifySns(signed({ SigningCertURL: "http://sns.eu-west-1.amazonaws.com/cert.pem" }), { ...options, fetchCertificate })).toBe(false);
    expect(fetchCertificate).not.toHaveBeenCalled();
    const other = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "pem" }).toString();
    expect(await verifySns(signed(), { ...options, fetchCertificate: async () => other })).toBe(false);
  });
});

describe("reading provider reports", () => {
  it("suppresses permanent bounces and complaints only", () => {
    expect(resendEntries({ type: "email.bounced", data: { to: ["A@x.org"], bounce: { type: "Permanent" } } })).toEqual([{ address: "A@x.org", reason: "BOUNCE" }]);
    expect(resendEntries({ type: "email.bounced", data: { to: ["a@x.org"], bounce: { type: "Transient" } } })).toEqual([]);
    expect(resendEntries({ type: "email.complained", data: { to: ["a@x.org"] } })).toEqual([{ address: "a@x.org", reason: "COMPLAINT" }]);
    expect(resendEntries({ type: "email.delivered", data: { to: ["a@x.org"] } })).toEqual([]);
    expect(postmarkEntries({ RecordType: "Bounce", Type: "HardBounce", Email: "a@x.org" })).toEqual([{ address: "a@x.org", reason: "BOUNCE" }]);
    expect(postmarkEntries({ RecordType: "Bounce", Type: "Transient", Email: "a@x.org" })).toEqual([]);
    expect(postmarkEntries({ RecordType: "SpamComplaint", Email: "a@x.org" })).toEqual([{ address: "a@x.org", reason: "COMPLAINT" }]);
    expect(sesEntries(JSON.stringify({ notificationType: "Bounce", bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: "a@x.org" }] } }))).toEqual([{ address: "a@x.org", reason: "BOUNCE" }]);
    expect(sesEntries(JSON.stringify({ eventType: "Complaint", complaint: { complainedRecipients: [{ emailAddress: "b@x.org" }] } }))).toEqual([{ address: "b@x.org", reason: "COMPLAINT" }]);
    expect(sesEntries(JSON.stringify({ notificationType: "Bounce", bounce: { bounceType: "Transient", bouncedRecipients: [{ emailAddress: "a@x.org" }] } }))).toEqual([]);
    expect(sesEntries("not json")).toEqual([]);
  });
});

describe("the webhook route", () => {
  const request = (provider: string, body: string, headers: Record<string, string>, query = "") => handleEmailWebhook(provider, new Request(`https://swo.example/api/email/webhooks/${provider}${query}`, { method: "POST", body, headers }));
  const bounce = JSON.stringify({ type: "email.bounced", data: { to: ["Gone@Example.org"], bounce: { type: "Permanent" } } });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settings.mockResolvedValue({ providerConfig: { webhookSecret: `whsec_${SECRET}` } });
    mocks.createMany.mockResolvedValue({ count: 1 });
  });

  it("records a verified bounce on the platform list, lower-cased, and audits it without the address", async () => {
    const h = svixHeaders(bounce, { timestamp: Math.floor(Date.now() / 1000) });
    const response = await request("resend", bounce, { "svix-id": h.id, "svix-timestamp": h.timestamp, "svix-signature": h.signature });
    expect(response.status).toBe(200);
    expect(mocks.createMany).toHaveBeenCalledWith({ data: [{ organisationId: null, address: "gone@example.org", reason: "BOUNCE", provider: "resend" }], skipDuplicates: true });
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("example.org");
  });

  it("refuses unsigned, tampered and replayed requests without writing anything", async () => {
    const h = svixHeaders(bounce, { timestamp: Math.floor(Date.now() / 1000) });
    expect((await request("resend", bounce, {})).status).toBe(401);
    expect((await request("resend", bounce.replace("Gone", "Other"), { "svix-id": h.id, "svix-timestamp": h.timestamp, "svix-signature": h.signature })).status).toBe(401);
    const old = svixHeaders(bounce, { timestamp: Math.floor(Date.now() / 1000) - 3600 });
    expect((await request("resend", bounce, { "svix-id": old.id, "svix-timestamp": old.timestamp, "svix-signature": old.signature })).status).toBe(401);
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it("verifies Postmark by basic auth and refuses unknown providers and unknown organisations", async () => {
    mocks.settings.mockResolvedValue({ providerConfig: { webhookSecret: "pm-secret" } });
    const body = JSON.stringify({ RecordType: "SpamComplaint", Email: "a@x.org" });
    expect((await request("postmark", body, { authorization: `Basic ${Buffer.from("u:wrong").toString("base64")}` })).status).toBe(401);
    expect((await request("postmark", body, { authorization: `Basic ${Buffer.from("u:pm-secret").toString("base64")}` })).status).toBe(200);
    expect((await request("mailgun", body, {})).status).toBe(404);
    mocks.orgSettings.mockResolvedValue(null);
    expect((await request("postmark", body, {}, "?org=org_unknown1")).status).toBe(401);
    expect((await request("postmark", body, {}, "?org=bad%20id")).status).toBe(404);
  });

  it("refuses SES reports when no topic is pinned", async () => {
    mocks.settings.mockResolvedValue({ providerConfig: {} });
    expect((await request("ses", JSON.stringify({ Type: "Notification" }), {})).status).toBe(401);
  });
});

describe("suppression", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips a suppressed address and never calls the provider", async () => {
    mocks.count.mockResolvedValue(1);
    const sendMail = vi.fn();
    await expect(withSuppression({ sendMail }, null).sendMail({ to: "Gone@Example.org" })).rejects.toBeInstanceOf(EmailSuppressedError);
    expect(mocks.count).toHaveBeenCalledWith({ where: { organisationId: null, address: { in: ["gone@example.org"] } } });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends otherwise, scoped to the sending account's own list", async () => {
    mocks.count.mockResolvedValue(0);
    const sendMail = vi.fn().mockResolvedValue({ accepted: ["a@x.org"], rejected: [] });
    await withSuppression({ sendMail }, "org_1").sendMail({ to: { name: "A", address: "a@x.org" } });
    expect(mocks.count).toHaveBeenCalledWith({ where: { organisationId: "org_1", address: { in: ["a@x.org"] } } });
    expect(sendMail).toHaveBeenCalledOnce();
  });
});
