import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postmarkMailer } from "@/lib/email/providers/postmark";
import { resendMailer } from "@/lib/email/providers/resend";
import { sesMailer } from "@/lib/email/providers/ses";
import { signV4 } from "@/lib/email/providers/sigv4";
import { EmailProviderError, outboxKey } from "@/lib/email/providers/types";
import { applyDraft, changedFields, describeConfig, providerDraftSchema, providerMailer, providerReady } from "@/lib/email/providerConfig";

const fetchMock = vi.fn();
const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
const message = { messageId: "<swo-abc123def456@outbox.invalid>", from: { name: 'Club "Name"', address: "club@example.org" }, to: "member@example.org", replyTo: "help@example.org", subject: "Hello", text: "Hi", html: "<p>Hi</p>", attachments: [{ filename: "card.pdf", content: Buffer.from("pdf"), contentType: "application/pdf" }] };

beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => { fetchMock.mockReset(); vi.unstubAllGlobals(); });

describe("Resend", () => {
  it("posts JSON over HTTPS with the outbox id as the idempotency key", async () => {
    fetchMock.mockResolvedValue(reply(200, { id: "x" }));
    const result = await resendMailer("re_key").sendMail(message);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.redirect).toBe("error");
    expect(init.headers).toMatchObject({ authorization: "Bearer re_key", "idempotency-key": "swo-abc123def456" });
    expect(JSON.parse(init.body)).toMatchObject({ from: '"Club Name" <club@example.org>', to: ["member@example.org"], reply_to: "help@example.org", attachments: [{ filename: "card.pdf", content: Buffer.from("pdf").toString("base64") }] });
    expect(result).toEqual({ accepted: ["member@example.org"], rejected: [] });
  });

  it("maps errors: credentials permanent, throttling and outages retryable, network failures retryable", async () => {
    fetchMock.mockResolvedValueOnce(reply(401));
    await expect(resendMailer("k").sendMail(message)).rejects.toMatchObject({ retryable: false, status: 401 });
    fetchMock.mockResolvedValueOnce(reply(429));
    await expect(resendMailer("k").sendMail(message)).rejects.toMatchObject({ retryable: true });
    fetchMock.mockResolvedValueOnce(reply(503));
    await expect(resendMailer("k").sendMail(message)).rejects.toMatchObject({ retryable: true });
    fetchMock.mockRejectedValueOnce(new Error("socket hang up"));
    await expect(resendMailer("k").sendMail(message)).rejects.toBeInstanceOf(EmailProviderError);
  });

  it("treats a still-processing duplicate (409) as accepted and a refused address (422) as rejected", async () => {
    fetchMock.mockResolvedValueOnce(reply(409));
    expect(await resendMailer("k").sendMail(message)).toMatchObject({ accepted: ["member@example.org"] });
    fetchMock.mockResolvedValueOnce(reply(422));
    expect(await resendMailer("k").sendMail(message)).toMatchObject({ rejected: ["member@example.org"] });
  });

  it("never carries the key in an error message", async () => {
    fetchMock.mockResolvedValue(reply(401));
    const error = await resendMailer("re_secret_key").sendMail(message).catch((caught: Error) => caught);
    expect((error as Error).message).not.toContain("re_secret_key");
  });
});

describe("Postmark", () => {
  it("posts to the chosen stream and carries the outbox id as metadata, not as a key", async () => {
    fetchMock.mockResolvedValue(reply(200, { ErrorCode: 0 }));
    const result = await postmarkMailer("token", "broadcast").sendMail(message);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.postmarkapp.com/email");
    expect(init.headers["x-postmark-server-token"]).toBe("token");
    expect(init.headers["idempotency-key"]).toBeUndefined();
    expect(JSON.parse(init.body)).toMatchObject({ MessageStream: "broadcast", To: "member@example.org", Metadata: { outbox: "swo-abc123def456" }, Attachments: [{ Name: "card.pdf", ContentType: "application/pdf" }] });
    expect(result).toEqual({ accepted: ["member@example.org"], rejected: [] });
  });

  it("reports an inactive recipient as rejected and other refusals as errors", async () => {
    fetchMock.mockResolvedValueOnce(reply(422, { ErrorCode: 406 }));
    expect(await postmarkMailer("t", "outbound").sendMail(message)).toMatchObject({ accepted: [], rejected: ["member@example.org"] });
    fetchMock.mockResolvedValueOnce(reply(401, { ErrorCode: 10 }));
    await expect(postmarkMailer("t", "outbound").sendMail(message)).rejects.toMatchObject({ retryable: false });
    fetchMock.mockResolvedValueOnce(reply(500));
    await expect(postmarkMailer("t", "outbound").sendMail(message)).rejects.toMatchObject({ retryable: true });
  });
});

describe("Amazon SES", () => {
  const credentials = { region: "eu-west-1", accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" };

  it("sends a signed raw message to the regional SES v2 endpoint", async () => {
    fetchMock.mockResolvedValue(reply(200, { MessageId: "x" }));
    const result = await sesMailer(credentials).sendMail(message);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://email.eu-west-1.amazonaws.com/v2/email/outbound-emails");
    expect(init.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/eu-west-1\/ses\/aws4_request, SignedHeaders=host;x-amz-date, Signature=[0-9a-f]{64}$/);
    expect(init.headers["idempotency-key"]).toBeUndefined();
    const body = JSON.parse(init.body);
    expect(body.Destination.ToAddresses).toEqual(["member@example.org"]);
    expect(Buffer.from(body.Content.Raw.Data, "base64").toString()).toContain("card.pdf");
    expect(JSON.stringify(init.headers)).not.toContain("secret");
    expect(result.accepted).toEqual(["member@example.org"]);
  });

  it("refuses a region that could point somewhere else and maps errors", async () => {
    expect(() => sesMailer({ ...credentials, region: "evil.example.com/" })).toThrow(EmailProviderError);
    fetchMock.mockResolvedValueOnce(reply(403));
    await expect(sesMailer(credentials).sendMail(message)).rejects.toMatchObject({ retryable: false });
    fetchMock.mockResolvedValueOnce(reply(500));
    await expect(sesMailer(credentials).sendMail(message)).rejects.toMatchObject({ retryable: true });
  });

  it("signs the AWS get-vanilla test vector", () => {
    const headers = signV4({ method: "GET", host: "example.amazonaws.com", path: "/", body: "", region: "us-east-1", service: "service", accessKeyId: "AKIDEXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", now: new Date("2015-08-30T12:36:00Z") });
    expect(headers.authorization).toBe("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31");
  });
});

describe("provider configuration", () => {
  it("extracts the outbox id only from outbox message ids", () => {
    expect(outboxKey("<swo-abc123def456@outbox.invalid>")).toBe("swo-abc123def456");
    expect(outboxKey("<other@example.org>")).toBeUndefined();
    expect(outboxKey(undefined)).toBeUndefined();
  });

  it("keeps saved secrets when the form leaves them blank and replaces them when given", () => {
    const saved = { resendApiKey: "re_old", webhookSecret: "whsec_old", sesRegion: "eu-west-1" };
    const kept = applyDraft(saved, providerDraftSchema.parse({ emailProvider: "resend", resendApiKey: "", sesRegion: "eu-west-1" }));
    expect(kept.resendApiKey).toBe("re_old");
    expect(kept.webhookSecret).toBe("whsec_old");
    const replaced = applyDraft(saved, providerDraftSchema.parse({ emailProvider: "resend", resendApiKey: "re_new" }));
    expect(replaced.resendApiKey).toBe("re_new");
    expect(changedFields(saved, replaced)).toBe("sesRegion,resendApiKey");
  });

  it("describes a config without any secret", () => {
    const view = describeConfig({ resendApiKey: "re_secret", sesSecretAccessKey: "aws_secret", postmarkServerToken: "pm_secret", webhookSecret: "whsec_secret", sesRegion: "eu-west-1" });
    expect(JSON.stringify(view)).not.toMatch(/re_secret|aws_secret|pm_secret|whsec_secret/);
    expect(view).toMatchObject({ hasResendKey: true, hasSesSecret: true, hasPostmarkToken: true, hasWebhookSecret: true, sesRegion: "eu-west-1" });
  });

  it("is ready only when every field the provider needs is present", () => {
    expect(providerReady("resend", {})).toBe(false);
    expect(providerReady("resend", { resendApiKey: "k" })).toBe(true);
    expect(providerReady("ses", { sesRegion: "eu-west-1", sesAccessKeyId: "a" })).toBe(false);
    expect(providerReady("postmark", { postmarkServerToken: "t" })).toBe(true);
    expect(() => providerMailer("resend", {})).toThrow(EmailProviderError);
  });
});
