import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ settings: vi.fn(), find: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/sms/settings", () => ({ getSmsSettings: m.settings }));
vi.mock("@/lib/db", () => ({ prisma: { smsCode: { findFirst: m.find, update: m.update } } }));

import crypto from "node:crypto";
import { handleSmsWebhook } from "@/lib/sms/webhooks/handle";
import { verifyTwilioSignature, verifyUrlToken } from "@/lib/sms/webhooks/verify";

const sign = (token: string, url: string, params: Record<string, string>) =>
  crypto.createHmac("sha1", token).update(Object.keys(params).sort().reduce((text, key) => text + key + params[key], url)).digest("base64");

describe("Twilio signature", () => {
  // The example in Twilio's own security documentation.
  const url = "https://mycompany.com/myapp.php?foo=1&bar=2";
  const params = new URLSearchParams({ CallSid: "CA1234567890ABCDE", Caller: "+14158675310", Digits: "1234", From: "+14158675310", To: "+18005551212" });
  it("accepts the documented example and refuses a tampered body, address, token or missing signature", () => {
    const good = "GvWf1cFY/Q7PnoempGyD5oXAezc=";
    expect(verifyTwilioSignature("12345", url, params, good)).toBe(true);
    const tampered = new URLSearchParams(params);
    tampered.set("Digits", "9999");
    expect(verifyTwilioSignature("12345", url, tampered, good)).toBe(false);
    expect(verifyTwilioSignature("12345", `${url}&x=1`, params, good)).toBe(false);
    expect(verifyTwilioSignature("other", url, params, good)).toBe(false);
    expect(verifyTwilioSignature("12345", url, params, null)).toBe(false);
    expect(verifyTwilioSignature("", url, params, good)).toBe(false);
  });
  it("checks a token in the address in constant time", () => {
    expect(verifyUrlToken("secret-token-1234", "secret-token-1234")).toBe(true);
    expect(verifyUrlToken("secret-token-1234", "secret-token-123x")).toBe(false);
    expect(verifyUrlToken("secret-token-1234", null)).toBe(false);
    expect(verifyUrlToken("", "")).toBe(false);
  });
});

describe("delivery report endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_BASE_URL = "https://swo.example";
    m.settings.mockResolvedValue({ config: { twilioAuthToken: "tw-token", webhookSecret: "msg91-secret-token-1" } });
    m.find.mockResolvedValue({ id: "row1", deliveryState: "sent" });
  });
  const twilio = (fields: Record<string, string>, signature?: string) => {
    const body = new URLSearchParams(fields).toString();
    return handleSmsWebhook("twilio", new Request("http://backend.internal/api/sms/webhooks/twilio", { method: "POST", body, headers: { "x-twilio-signature": signature ?? sign("tw-token", "https://swo.example/api/sms/webhooks/twilio", fields), "content-type": "application/x-www-form-urlencoded" } }));
  };

  it("records a signed Twilio report against the message id, keeping only state and error code", async () => {
    const response = await twilio({ MessageSid: "SM1", MessageStatus: "delivered", ErrorCode: "", To: "+919876543210" });
    expect(response.status).toBe(200);
    expect(m.find).toHaveBeenCalledWith({ where: { providerRef: "SM1" }, select: { id: true, deliveryState: true } });
    expect(m.update).toHaveBeenCalledWith({ where: { id: "row1" }, data: { deliveryState: "delivered", deliveryError: "" } });
    expect(JSON.stringify(m.update.mock.calls)).not.toContain("9876543210");
  });
  it("refuses a Twilio report with a wrong or missing signature before reading it", async () => {
    expect((await twilio({ MessageSid: "SM1", MessageStatus: "delivered" }, "bad")).status).toBe(401);
    expect(m.find).not.toHaveBeenCalled();
    m.settings.mockResolvedValue({ config: {} });
    expect((await twilio({ MessageSid: "SM1", MessageStatus: "delivered" })).status).toBe(401);
  });
  it("never moves a delivery state backwards", async () => {
    m.find.mockResolvedValue({ id: "row1", deliveryState: "delivered" });
    await twilio({ MessageSid: "SM1", MessageStatus: "sent" });
    expect(m.update).not.toHaveBeenCalled();
    await twilio({ MessageSid: "SM1", MessageStatus: "unknown-state" });
    expect(m.update).not.toHaveBeenCalled();
  });
  it("accepts MSG91 reports only with the secret token", async () => {
    const post = (query: string, body: unknown) => handleSmsWebhook("msg91", new Request(`https://swo.example/api/sms/webhooks/msg91${query}`, { method: "POST", body: JSON.stringify(body) }));
    expect((await post("", [{ requestId: "r1", status: "1" }])).status).toBe(401);
    expect((await post("?token=wrong", [{ requestId: "r1", status: "1" }])).status).toBe(401);
    expect(m.find).not.toHaveBeenCalled();
    expect((await post("?token=msg91-secret-token-1", [{ requestId: "r1", status: "1" }, { request_id: "r2", status: "2" }])).status).toBe(200);
    expect(m.update).toHaveBeenNthCalledWith(1, { where: { id: "row1" }, data: { deliveryState: "delivered", deliveryError: null } });
    expect(m.update).toHaveBeenNthCalledWith(2, { where: { id: "row1" }, data: { deliveryState: "failed", deliveryError: "2" } });
    expect((await post("?token=msg91-secret-token-1", "not json{")).status).toBe(200);
  });
  it("answers 404 for an unknown provider and 413 for an oversized body", async () => {
    expect((await handleSmsWebhook("nexmo", new Request("https://swo.example/x", { method: "POST", body: "{}" }))).status).toBe(404);
    expect((await handleSmsWebhook("twilio", new Request("https://swo.example/x", { method: "POST", body: "{}", headers: { "content-length": "999999" } }))).status).toBe(413);
  });
});
