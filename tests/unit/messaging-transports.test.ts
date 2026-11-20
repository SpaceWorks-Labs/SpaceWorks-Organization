import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { telegramTransport } from "@/lib/notify/transports/telegram";
import { slackTransport } from "@/lib/notify/transports/slack";
import { discordTransport } from "@/lib/notify/transports/discord";
import { mattermostTransport, operatorListedHosts } from "@/lib/notify/transports/mattermost";
import { metaWhatsApp, twilioWhatsApp, whatsappVariable } from "@/lib/notify/transports/whatsapp";
import { ChannelError } from "@/lib/notify/errors";

type Seen = { method: string; url: string; headers: http.IncomingHttpHeaders; body: string };
let server: http.Server;
let base: string;
let seen: Seen[] = [];
let respond: (request: Seen) => { status: number; json: unknown } = () => ({ status: 200, json: {} });

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const entry = { method: req.method ?? "", url: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks).toString("utf8") };
      seen.push(entry);
      const { status, json } = respond(entry);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise((resolve) => server.close(resolve)));
const reset = (fn: typeof respond) => { seen = []; respond = fn; };

describe("Telegram", () => {
  it("sends to a chat id and keeps the token out of errors", async () => {
    reset(() => ({ status: 200, json: { ok: true, result: { message_id: 77 } } }));
    expect(await telegramTransport({ botToken: "123456:SECRETSECRETSECRETSECRETSECRETSEC" }, base).send("555", "Hello")).toEqual({ providerRef: "77" });
    expect(seen[0].url).toBe("/bot123456:SECRETSECRETSECRETSECRETSECRETSEC/sendMessage");
    expect(JSON.parse(seen[0].body)).toMatchObject({ chat_id: "555", text: "Hello" });
    reset(() => ({ status: 403, json: { ok: false } }));
    const error = await telegramTransport({ botToken: "123456:SECRETSECRETSECRETSECRETSECRETSEC" }, base).send("555", "x").catch((e) => e);
    expect(error).toBeInstanceOf(ChannelError);
    expect(error.retryable).toBe(false);
    expect(error.message).not.toContain("SECRET");
  });
  it("registers the webhook with its secret token", async () => {
    reset(() => ({ status: 200, json: { ok: true } }));
    await telegramTransport({ botToken: "123456:SECRETSECRETSECRETSECRETSECRETSEC" }, base).setWebhook("https://swo.example/api/messaging/webhooks/telegram?scope=platform", "hook-secret");
    expect(JSON.parse(seen[0].body)).toMatchObject({ secret_token: "hook-secret" });
  });
  it("retries throttling and outages", async () => {
    reset(() => ({ status: 429, json: {} }));
    expect(((await telegramTransport({ botToken: "123456:SECRETSECRETSECRETSECRETSECRETSEC" }, base).send("1", "x").catch((e) => e)) as ChannelError).retryable).toBe(true);
  });
});

describe("Slack", () => {
  it("posts a direct message to a user id with the bot token", async () => {
    reset(() => ({ status: 200, json: { ok: true, ts: "1700.01" } }));
    expect(await slackTransport({ botToken: "xoxb-token" }, base).send("U123", "Hi")).toEqual({ providerRef: "1700.01" });
    expect(seen[0].headers.authorization).toBe("Bearer xoxb-token");
    expect(JSON.parse(seen[0].body)).toMatchObject({ channel: "U123", text: "Hi" });
  });
  it("reads Slack's 200-with-error answers", async () => {
    reset(() => ({ status: 200, json: { ok: false, error: "ratelimited" } }));
    expect(((await slackTransport({ botToken: "xoxb-token" }, base).send("U1", "x").catch((e) => e)) as ChannelError).retryable).toBe(true);
    reset(() => ({ status: 200, json: { ok: false, error: "user_not_found" } }));
    expect(((await slackTransport({ botToken: "xoxb-token" }, base).send("U1", "x").catch((e) => e)) as ChannelError).retryable).toBe(false);
  });
});

describe("Discord", () => {
  it("opens a direct message channel, then posts in it", async () => {
    reset((request) => (request.url.endsWith("/users/@me/channels") ? { status: 200, json: { id: "chan1" } } : { status: 200, json: { id: "msg1" } }));
    expect(await discordTransport({ botToken: "bot-token" }, base).send("user9", "Hi")).toEqual({ providerRef: "msg1" });
    expect(seen.map((entry) => entry.url)).toEqual(["/users/@me/channels", "/channels/chan1/messages"]);
    expect(seen[0].headers.authorization).toBe("Bot bot-token");
    expect(JSON.parse(seen[0].body)).toEqual({ recipient_id: "user9" });
    expect(JSON.parse(seen[1].body).allowed_mentions).toEqual({ parse: [] });
  });
  it("treats closed direct messages as a permanent refusal", async () => {
    reset((request) => (request.url.endsWith("/users/@me/channels") ? { status: 200, json: { id: "chan1" } } : { status: 403, json: { code: 50007 } }));
    expect(((await discordTransport({ botToken: "bot-token" }, base).send("u", "x").catch((e) => e)) as ChannelError).retryable).toBe(false);
  });
});

describe("Mattermost", () => {
  it("finds the bot, opens the direct channel and posts", async () => {
    reset((request) => (request.url.endsWith("/users/me") ? { status: 200, json: { id: "botid" } } : request.url.endsWith("/channels/direct") ? { status: 201, json: { id: "dm1" } } : { status: 201, json: { id: "post1" } }));
    expect(await mattermostTransport({ serverUrl: base, botToken: "tok" }).send("u1", "Hi")).toEqual({ providerRef: "post1" });
    expect(seen.map((entry) => entry.url)).toEqual(["/api/v4/users/me", "/api/v4/channels/direct", "/api/v4/posts"]);
    expect(JSON.parse(seen[1].body)).toEqual(["botid", "u1"]);
    expect(seen[0].headers.authorization).toBe("Bearer tok");
  });
  it("reads the operator's list of trusted hosts", () => {
    expect(operatorListedHosts({ MESSAGING_MATTERMOST_HOSTS: " Chat.Internal, other.lan " })).toEqual(["chat.internal", "other.lan"]);
  });
});

describe("WhatsApp", () => {
  it("sends a Twilio content template with numbered variables and an idempotency token", async () => {
    reset(() => ({ status: 201, json: { sid: "SM1" } }));
    const result = await twilioWhatsApp({ accountSid: "AC" + "a".repeat(32), authToken: "tok", from: "+14155238886" }, base).send({ to: "+919876543210", template: "HX123", language: "en", variables: ["Asha", "31 Mar"], key: "swo-1-wa" });
    expect(result).toEqual({ providerRef: "SM1" });
    const form = new URLSearchParams(seen[0].body);
    expect(form.get("To")).toBe("whatsapp:+919876543210");
    expect(form.get("From")).toBe("whatsapp:+14155238886");
    expect(form.get("ContentSid")).toBe("HX123");
    expect(JSON.parse(form.get("ContentVariables")!)).toEqual({ "1": "Asha", "2": "31 Mar" });
    expect(seen[0].headers["i-twilio-idempotency-token"]).toBe("swo-1-wa");
  });
  it("sends a Meta Cloud API template with body parameters", async () => {
    reset(() => ({ status: 200, json: { messages: [{ id: "wamid.1" }] } }));
    const result = await metaWhatsApp({ phoneNumberId: "1234567", accessToken: "meta-token" }, base).send({ to: "+919876543210", template: "renewal_due", language: "en_US", variables: ["Asha\nMenon", "x"] });
    expect(result).toEqual({ providerRef: "wamid.1" });
    const body = JSON.parse(seen[0].body);
    expect(seen[0].url).toBe("/1234567/messages");
    expect(body.to).toBe("919876543210");
    expect(body.template).toMatchObject({ name: "renewal_due", language: { code: "en_US" } });
    expect(body.template.components[0].parameters[0]).toEqual({ type: "text", text: "Asha Menon" });
    expect(seen[0].headers.authorization).toBe("Bearer meta-token");
  });
  it("keeps template variables to one line", () => {
    expect(whatsappVariable("a\n\n b\t c")).toBe("a b c");
  });
});
