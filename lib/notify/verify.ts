import crypto from "node:crypto";

/**
 * Checks for what providers send us. Nothing in a request body is read until its check passes. Every comparison hashes
 * both sides first, so it takes the same time whatever the lengths and wherever the first difference is.
 */
const digest = (value: string) => crypto.createHash("sha256").update(value).digest();
export const safeEqual = (a: string, b: string) => crypto.timingSafeEqual(digest(a), digest(b)) && a.length === b.length;

/** Meta signs the raw body with the app secret: `X-Hub-Signature-256: sha256=<hex>`. */
export function verifyMetaSignature(appSecret: string, rawBody: string, header: string | null) {
  if (!appSecret || !header) return false;
  return safeEqual(header, `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`);
}

/** Telegram repeats the secret we gave `setWebhook` in `X-Telegram-Bot-Api-Secret-Token`. */
export function verifyTelegramSecret(expected: string, header: string | null) {
  return Boolean(expected && header && safeEqual(header, expected));
}

/** Slack signs `v0:<timestamp>:<body>` with the signing secret; requests older than five minutes are refused. */
export function verifySlackSignature(signingSecret: string, timestamp: string | null, rawBody: string, signature: string | null, now = Date.now()) {
  if (!signingSecret || !timestamp || !signature || !/^\d{9,12}$/.test(timestamp)) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 5 * 60) return false;
  return safeEqual(signature, `v0=${crypto.createHmac("sha256", signingSecret).update(`v0:${timestamp}:${rawBody}`, "utf8").digest("hex")}`);
}

/** The DER prefix that turns a raw 32-byte Ed25519 public key into a SubjectPublicKeyInfo Node can load. */
const ED25519_SPKI = Buffer.from("302a300506032b6570032100", "hex");

/** Discord signs `<timestamp><body>` with Ed25519; the application's public key (hex) checks it. */
export function verifyDiscordSignature(publicKeyHex: string, timestamp: string | null, rawBody: string, signatureHex: string | null) {
  if (!/^[0-9a-fA-F]{64}$/.test(publicKeyHex) || !timestamp || !signatureHex || !/^[0-9a-fA-F]{128}$/.test(signatureHex)) return false;
  try {
    const key = crypto.createPublicKey({ key: Buffer.concat([ED25519_SPKI, Buffer.from(publicKeyHex, "hex")]), format: "der", type: "spki" });
    return crypto.verify(null, Buffer.from(timestamp + rawBody, "utf8"), key, Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}

/** A Mattermost slash command carries the command's token in the form body. */
export function verifyMattermostToken(expected: string, token: string | null) {
  return Boolean(expected && token && safeEqual(token, expected));
}
