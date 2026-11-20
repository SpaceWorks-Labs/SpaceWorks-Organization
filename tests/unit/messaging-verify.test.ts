import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyDiscordSignature, verifyMattermostToken, verifyMetaSignature, verifySlackSignature, verifyTelegramSecret } from "@/lib/notify/verify";
import { inQuietHours, parseClock, quietEnd } from "@/lib/notify/quiet";
import { parseCode } from "@/lib/notify/endpoints";
import { isStartWord, isStopWord, readStopToken, stopToken } from "@/lib/notify/consent";
import { cleanRouting, routeFor } from "@/lib/messages/kinds";
import { smsSegments } from "@/lib/messages/sms";
import { fillPlaceholders, renderEmailTemplate, renderShortText, sampleValues, STANDARD_TEMPLATES, templateProblem } from "@/lib/email/templates";
import { MEMBER_MESSAGE_KINDS } from "@/lib/messages/kinds";
import { renderBrandedEmail } from "@/lib/email/message";
import { codeFromText } from "@/lib/notify/webhooks/common";

process.env.AUTH_SECRET ??= "unit-test-secret-unit-test-secret-42";

describe("webhook verification", () => {
  it("checks Meta's X-Hub-Signature-256 over the raw body", () => {
    const body = '{"entry":[]}';
    const good = `sha256=${crypto.createHmac("sha256", "app-secret").update(body).digest("hex")}`;
    expect(verifyMetaSignature("app-secret", body, good)).toBe(true);
    expect(verifyMetaSignature("app-secret", `${body} `, good)).toBe(false);
    expect(verifyMetaSignature("other", body, good)).toBe(false);
    expect(verifyMetaSignature("app-secret", body, null)).toBe(false);
    expect(verifyMetaSignature("", body, good)).toBe(false);
  });

  it("compares Telegram's secret token exactly", () => {
    expect(verifyTelegramSecret("s3cret-token", "s3cret-token")).toBe(true);
    expect(verifyTelegramSecret("s3cret-token", "s3cret-tokeN")).toBe(false);
    expect(verifyTelegramSecret("s3cret-token", null)).toBe(false);
    expect(verifyTelegramSecret("", "")).toBe(false);
  });

  it("checks Slack's v0 signature and refuses a stale timestamp", () => {
    const now = 1_800_000_000_000;
    const ts = String(Math.floor(now / 1000));
    const body = "payload=1";
    const sig = `v0=${crypto.createHmac("sha256", "signing").update(`v0:${ts}:${body}`).digest("hex")}`;
    expect(verifySlackSignature("signing", ts, body, sig, now)).toBe(true);
    expect(verifySlackSignature("signing", ts, `${body}x`, sig, now)).toBe(false);
    expect(verifySlackSignature("signing", ts, body, sig, now + 6 * 60_000)).toBe(false);
    expect(verifySlackSignature("wrong", ts, body, sig, now)).toBe(false);
  });

  it("verifies a Discord interaction's Ed25519 signature with the application's public key", () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
    const ts = "1700000000";
    const body = '{"type":1}';
    const sig = crypto.sign(null, Buffer.from(ts + body), privateKey).toString("hex");
    expect(verifyDiscordSignature(raw, ts, body, sig)).toBe(true);
    expect(verifyDiscordSignature(raw, ts, `${body} `, sig)).toBe(false);
    expect(verifyDiscordSignature(raw, "1700000001", body, sig)).toBe(false);
    expect(verifyDiscordSignature(raw, ts, body, `${sig.slice(0, -1)}0`)).toBe(false);
    expect(verifyDiscordSignature("zz", ts, body, sig)).toBe(false);
  });

  it("compares Mattermost's slash command token", () => {
    expect(verifyMattermostToken("abc123", "abc123")).toBe(true);
    expect(verifyMattermostToken("abc123", "abc124")).toBe(false);
    expect(verifyMattermostToken("abc123", null)).toBe(false);
  });
});

describe("quiet hours", () => {
  const start = parseClock("22:00")!;
  const end = parseClock("08:00")!;
  it("covers a window that crosses midnight, in the organisation's timezone", () => {
    // 23:00 in India is 17:30 UTC.
    expect(inQuietHours(new Date("2026-11-19T17:30:00Z"), "Asia/Kolkata", start, end)).toBe(true);
    expect(inQuietHours(new Date("2026-11-19T04:00:00Z"), "Asia/Kolkata", start, end)).toBe(false);
    expect(inQuietHours(new Date("2026-11-19T01:00:00Z"), "Asia/Kolkata", start, end)).toBe(true);
    expect(inQuietHours(new Date("2026-11-19T17:30:00Z"), "Asia/Kolkata", null, null)).toBe(false);
  });
  it("says when the window ends, and nothing outside it", () => {
    expect(quietEnd(new Date("2026-11-19T17:30:00Z"), "Asia/Kolkata", start, end)?.toISOString()).toBe("2026-11-20T02:30:00.000Z");
    expect(quietEnd(new Date("2026-11-19T06:30:00Z"), "Asia/Kolkata", start, end)).toBeNull();
  });
  it("reads clock times strictly", () => {
    expect(parseClock("07:05")).toBe(425);
    expect(parseClock("24:00")).toBeNull();
    expect(parseClock("7:05")).toBeNull();
  });
});

describe("codes, stop words and stop links", () => {
  it("reads a code however it arrives", () => {
    expect(parseCode("abcd2345-xy7z4q")).toEqual({ id: "ABCD2345", secret: "XY7Z4Q" });
    expect(parseCode("ABCD2345_XY7Z4Q")).toEqual({ id: "ABCD2345", secret: "XY7Z4Q" });
    expect(parseCode("ABCD 2345 XY7Z 4Q")).toEqual({ id: "ABCD2345", secret: "XY7Z4Q" });
    expect(parseCode("ABCD2345-XY7Z4")).toBeNull();
    expect(parseCode("ABCD2345-XY7Z41")).toBeNull();
    expect(codeFromText("/start ABCD2345_XY7Z4Q")).toBe("ABCD2345_XY7Z4Q");
    expect(codeFromText("hello there")).toBeUndefined();
  });
  it("recognises the standard stop and start words only when alone", () => {
    for (const word of ["STOP", "stop", " Unsubscribe ", "STOP."]) expect(isStopWord(word)).toBe(true);
    for (const word of ["please stop", "stopping", "nonstop"]) expect(isStopWord(word)).toBe(false);
    expect(isStartWord("START")).toBe(true);
  });
  it("signs the stop link and refuses a tampered one", () => {
    const token = stopToken("org_1234567890", "user_1234567890", "TELEGRAM");
    expect(readStopToken(token)).toEqual({ organisationId: "org_1234567890", userId: "user_1234567890", channel: "TELEGRAM" });
    const [body, sig] = token.split(".");
    const forged = Buffer.from("org_9999999999.user_1234567890.1").toString("base64url");
    expect(readStopToken(`${forged}.${sig}`)).toBeNull();
    expect(readStopToken(`${body}.${sig.slice(0, -1)}A`)).toBeNull();
    expect(readStopToken("nonsense")).toBeNull();
  });
});

describe("routing and wording", () => {
  it("cleans a saved routing: known kinds and channels, no repeats, a short list", () => {
    expect(cleanRouting({ "renewal-due": ["WHATSAPP", "SMS", "WHATSAPP", "EMAIL", "TELEGRAM", "SLACK"], nonsense: ["EMAIL"], lapsed: ["FAX"] })).toEqual({ "renewal-due": ["WHATSAPP", "SMS", "EMAIL", "TELEGRAM"] });
    expect(routeFor({}, "lapsed")).toEqual(["EMAIL"]);
  });
  it("has standard wording for every kind that renders with sample values and never leaves a placeholder", () => {
    for (const kind of MEMBER_MESSAGE_KINDS) {
      const standard = STANDARD_TEMPLATES[kind];
      expect(templateProblem(standard)).toBeNull();
      const email = renderEmailTemplate(standard, sampleValues("Example Network"));
      expect(`${email.subject} ${email.heading} ${email.paragraphs.join(" ")}`).not.toMatch(/\{[a-zA-Z]+\}/);
      expect(renderShortText(standard.short, sampleValues("Example Network"))).not.toMatch(/\{[a-zA-Z]+\}/);
      expect(standard.short.length).toBeLessThanOrEqual(240);
    }
  });
  it("escapes everything typed or filled in, so a message is never HTML", () => {
    const rendered = renderEmailTemplate({ subject: "S", heading: "<i>H</i>", body: "{name} {paymentInstructions}" }, { name: "<script>x</script>", paymentInstructions: "Pay <b>now</b>" });
    const { html } = renderBrandedEmail(rendered);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>now</b>");
    expect(html).toContain("&lt;script&gt;");
  });
  it("fills the new placeholders and leaves unknown ones as typed", () => {
    expect(fillPlaceholders("{amount} by {dueDate}, {payLink} {graceUntil} {nope}", { amount: "₹10", dueDate: "1 Jan", payLink: "https://x.test/p", graceUntil: null })).toBe("₹10 by 1 Jan, https://x.test/p  {nope}");
  });
  it("counts text-message segments by character set", () => {
    expect(smsSegments("a".repeat(160))).toEqual({ characters: 160, segments: 1, unicode: false });
    expect(smsSegments("a".repeat(161)).segments).toBe(2);
    expect(smsSegments("€".repeat(81)).segments).toBe(2);
    expect(smsSegments("₹ 500").unicode).toBe(true);
    expect(smsSegments("മലയാളം".repeat(12)).segments).toBe(2);
    expect(smsSegments("").segments).toBe(0);
  });
});
