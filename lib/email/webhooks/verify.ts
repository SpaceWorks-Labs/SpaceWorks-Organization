import crypto from "node:crypto";
import { safeEqual } from "@/lib/safeEqual";

/**
 * Resend signs webhooks with Svix: HMAC-SHA256 over "id.timestamp.body" with the base64 secret after "whsec_",
 * sent as space-separated "v1,<signature>" entries. A timestamp more than five minutes from now is refused,
 * so a captured request cannot be replayed later.
 */
export function verifySvix(secret: string, headers: { id: string | null; timestamp: string | null; signature: string | null }, body: string, now = Date.now(), toleranceSeconds = 300) {
  if (!headers.id || !headers.timestamp || !headers.signature || !secret) return false;
  const seconds = Number(headers.timestamp);
  if (!Number.isFinite(seconds) || Math.abs(now / 1000 - seconds) > toleranceSeconds) return false;
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = crypto.createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${body}`, "utf8").digest("base64");
  return headers.signature.split(" ").some((entry) => {
    const [version, signature] = entry.split(",");
    return version === "v1" && Boolean(signature) && safeEqual(signature, expected);
  });
}

/** Postmark does not sign webhooks; it sends HTTP basic auth. The password must be the saved webhook secret. */
export function verifyBasicAuth(secret: string, header: string | null) {
  if (!secret || !header?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const password = decoded.slice(decoded.indexOf(":") + 1);
  return decoded.includes(":") && safeEqual(password, secret);
}

export type SnsMessage = {
  Type: string; MessageId: string; TopicArn: string; Message: string; Timestamp: string; SignatureVersion: string; Signature: string; SigningCertURL: string;
  Subject?: string; Token?: string; SubscribeURL?: string;
};

const CERT_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com(?:\.cn)?$/;
const SIGNED_FIELDS: Record<string, string[]> = {
  Notification: ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"],
  SubscriptionConfirmation: ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"],
  UnsubscribeConfirmation: ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"],
};

const certificates = new Map<string, string>();

/** Fetch an SNS signing certificate from an Amazon host over HTTPS, without redirects. */
export async function fetchSnsCertificate(url: string) {
  const cached = certificates.get(url);
  if (cached) return cached;
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10_000), cache: "no-store" });
  const pem = response.ok ? (await response.text()).slice(0, 20_000) : "";
  if (!pem.includes("BEGIN CERTIFICATE")) throw new Error("No certificate.");
  if (certificates.size > 20) certificates.clear();
  certificates.set(url, pem);
  return pem;
}

/** Whether a URL is an SNS host's HTTPS address (for the certificate and the subscription confirmation). */
export function isSnsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.port && !url.username && CERT_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Amazon SNS signature verification (how SES reports bounces): the certificate must come from an Amazon SNS
 * host, the signature must match the canonical string, the message must be recent, and it must come from the
 * one topic the operator pinned, so a validly signed message from another AWS account's topic is refused.
 */
export async function verifySns(message: SnsMessage, options: { topicArn: string; now?: number; toleranceSeconds?: number; fetchCertificate?: (url: string) => Promise<string> }) {
  const fields = SIGNED_FIELDS[message.Type];
  if (!fields || !options.topicArn || message.TopicArn !== options.topicArn) return false;
  if (!isSnsUrl(message.SigningCertURL) || !new URL(message.SigningCertURL).pathname.endsWith(".pem")) return false;
  const age = Math.abs((options.now ?? Date.now()) - Date.parse(message.Timestamp));
  if (!Number.isFinite(age) || age > (options.toleranceSeconds ?? 3600) * 1000) return false;
  const algorithm = message.SignatureVersion === "1" ? "RSA-SHA1" : message.SignatureVersion === "2" ? "RSA-SHA256" : null;
  if (!algorithm) return false;
  const record = message as unknown as Record<string, string | undefined>;
  const canonical = fields.filter((name) => record[name] !== undefined).map((name) => `${name}\n${record[name]}\n`).join("");
  try {
    const certificate = await (options.fetchCertificate ?? fetchSnsCertificate)(message.SigningCertURL);
    return crypto.createVerify(algorithm).update(canonical, "utf8").verify(certificate, message.Signature, "base64");
  } catch {
    return false;
  }
}
