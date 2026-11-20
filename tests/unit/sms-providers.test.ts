import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { msg91Sender } from "@/lib/sms/providers/msg91";
import { twilioSender } from "@/lib/sms/providers/twilio";
import { SmsProviderError } from "@/lib/sms/providers/types";
import { applySmsDraft, buildSmsSender, changedSmsFields, describeSmsConfig, smsConfigWithEnv, smsDraftSchema, smsProviderReady } from "@/lib/sms/config";

const fetchMock = vi.fn();
const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
const message = { to: "+919876543210", text: "123456 is your Space Works Organization code.", code: "123456", brand: "Space Works Organization", key: "swo-abc123", statusCallback: "https://swo.example/api/sms/webhooks/twilio" };

beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => { fetchMock.mockReset(); vi.unstubAllGlobals(); });

describe("Twilio", () => {
  const sid = `AC${"a".repeat(32)}`;
  it("posts a form over HTTPS with basic auth, the idempotency token and the report address", async () => {
    fetchMock.mockResolvedValue(reply(201, { sid: "SM123" }));
    const result = await twilioSender({ accountSid: sid, secret: "token", from: "+15551234567" }).send(message);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`);
    expect(init.redirect).toBe("error");
    expect(init.headers.authorization).toBe(`Basic ${Buffer.from(`${sid}:token`).toString("base64")}`);
    expect(init.headers["i-twilio-idempotency-token"]).toBe("swo-abc123");
    const form = new URLSearchParams(init.body);
    expect(Object.fromEntries(form)).toEqual({ To: "+919876543210", Body: message.text, From: "+15551234567", StatusCallback: message.statusCallback });
    expect(result).toEqual({ providerRef: "SM123" });
  });
  it("signs in with an API key and prefers a messaging service over a from number", async () => {
    fetchMock.mockResolvedValue(reply(201, { sid: "SM1" }));
    await twilioSender({ accountSid: sid, secret: "secret", apiKeySid: "SKkey", from: "+1555", messagingServiceSid: "MGsvc" }).send(message);
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers.authorization).toBe(`Basic ${Buffer.from("SKkey:secret").toString("base64")}`);
    const form = new URLSearchParams(init.body);
    expect(form.get("MessagingServiceSid")).toBe("MGsvc");
    expect(form.has("From")).toBe(false);
  });
  it("maps errors: credentials and refused numbers permanent, throttling and outages retryable", async () => {
    const send = () => twilioSender({ accountSid: sid, secret: "t", from: "+1" }).send(message);
    fetchMock.mockResolvedValueOnce(reply(401));
    await expect(send()).rejects.toMatchObject({ retryable: false, status: 401 });
    fetchMock.mockResolvedValueOnce(reply(400, { code: 21211 }));
    await expect(send()).rejects.toMatchObject({ retryable: false, message: expect.stringContaining("will not send to this number") });
    fetchMock.mockResolvedValueOnce(reply(400, { code: 99999 }));
    await expect(send()).rejects.toMatchObject({ retryable: false, status: 400 });
    fetchMock.mockResolvedValueOnce(reply(429));
    await expect(send()).rejects.toMatchObject({ retryable: true });
    fetchMock.mockResolvedValueOnce(reply(503));
    await expect(send()).rejects.toMatchObject({ retryable: true });
    fetchMock.mockRejectedValueOnce(new Error("socket hang up"));
    await expect(send()).rejects.toMatchObject({ retryable: true });
  });
  it("never puts the secret or the number in an error message", async () => {
    fetchMock.mockResolvedValueOnce(reply(401));
    const error = (await twilioSender({ accountSid: sid, secret: "supersecret", from: "+1" }).send(message).catch((caught: SmsProviderError) => caught)) as SmsProviderError;
    expect(error.message).not.toContain("supersecret");
    expect(error.message).not.toContain("9876543210");
  });
});

describe("MSG91", () => {
  it("posts the template, the code and the brand to the Flow API without the plus", async () => {
    fetchMock.mockResolvedValue(reply(200, { type: "success", message: "req-1" }));
    const result = await msg91Sender({ authKey: "key", templateId: "tpl", senderId: "SWORGS" }).send(message);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://control.msg91.com/api/v5/flow/");
    expect(init.headers.authkey).toBe("key");
    expect(JSON.parse(init.body)).toEqual({ template_id: "tpl", sender: "SWORGS", short_url: "0", recipients: [{ mobiles: "919876543210", otp: "123456", brand: "Space Works Organization" }] });
    expect(result).toEqual({ providerRef: "req-1" });
  });
  it("treats a 200 error body as a refusal and maps statuses", async () => {
    const send = () => msg91Sender({ authKey: "k", templateId: "t" }).send(message);
    fetchMock.mockResolvedValueOnce(reply(200, { type: "error", message: "Template not found" }));
    await expect(send()).rejects.toMatchObject({ retryable: false });
    fetchMock.mockResolvedValueOnce(reply(401));
    await expect(send()).rejects.toMatchObject({ retryable: false, status: 401 });
    fetchMock.mockResolvedValueOnce(reply(500));
    await expect(send()).rejects.toMatchObject({ retryable: true });
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(send()).rejects.toMatchObject({ retryable: true });
  });
});

describe("SMS provider configuration", () => {
  const draft = (extra: Record<string, unknown> = {}) => smsDraftSchema.parse({ smsProvider: "twilio", ...extra });
  it("is ready only with every field the provider needs", () => {
    expect(smsProviderReady("twilio", { twilioAccountSid: "AC", twilioAuthToken: "t" })).toBe(false);
    expect(smsProviderReady("twilio", { twilioAccountSid: "AC", twilioAuthToken: "t", twilioFrom: "+1555" })).toBe(true);
    expect(smsProviderReady("twilio", { twilioAccountSid: "AC", twilioApiKeySid: "SK", twilioApiKeySecret: "s", twilioMessagingServiceSid: "MG" })).toBe(true);
    expect(smsProviderReady("msg91", { msg91AuthKey: "k" })).toBe(false);
    expect(smsProviderReady("msg91", { msg91AuthKey: "k", msg91TemplateId: "t" })).toBe(true);
  });
  it("refuses to build a sender for an incomplete provider", () => {
    expect(() => buildSmsSender("msg91", {})).toThrow(SmsProviderError);
  });
  it("keeps saved secrets when the form leaves them blank, and never describes a secret", () => {
    const saved = { twilioAccountSid: `AC${"b".repeat(32)}`, twilioAuthToken: "saved-token", msg91AuthKey: "saved-key" };
    const next = applySmsDraft(saved, draft({ twilioAccountSid: saved.twilioAccountSid, twilioFrom: "+15551234567" }));
    expect(next).toMatchObject({ twilioAuthToken: "saved-token", msg91AuthKey: "saved-key", twilioFrom: "+15551234567" });
    expect(applySmsDraft(next, draft({ twilioAuthToken: "new-token" })).twilioAuthToken).toBe("new-token");
    expect(JSON.stringify(describeSmsConfig(next))).not.toMatch(/saved-token|saved-key/);
    expect(describeSmsConfig(next)).toMatchObject({ hasTwilioAuthToken: true, hasMsg91AuthKey: true });
    expect(changedSmsFields(saved, next)).toBe("twilioFrom");
  });
  it("validates the plain fields", () => {
    expect(smsDraftSchema.safeParse({ smsProvider: "twilio", twilioAccountSid: "nope" }).success).toBe(false);
    expect(smsDraftSchema.safeParse({ smsProvider: "twilio", twilioFrom: "5551234" }).success).toBe(false);
    expect(smsDraftSchema.safeParse({ smsProvider: "msg91", msg91TemplateId: "bad id!" }).success).toBe(false);
    expect(smsDraftSchema.safeParse({ smsProvider: "other" }).success).toBe(false);
  });
  it("falls back to the environment for blank saved fields", () => {
    const config = smsConfigWithEnv({ twilioFrom: "+15550000000" }, { TWILIO_FROM: "+1999", TWILIO_AUTH_TOKEN: "env-token", MSG91_TEMPLATE_ID: "tpl" });
    expect(config).toMatchObject({ twilioFrom: "+15550000000", twilioAuthToken: "env-token", msg91TemplateId: "tpl" });
  });
});
