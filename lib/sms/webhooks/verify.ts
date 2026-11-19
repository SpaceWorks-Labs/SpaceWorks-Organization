import crypto from "node:crypto";

const safeEqual = (a: string, b: string) => {
  // Hash first so the comparison is constant-time whatever the lengths.
  const digest = (value: string) => crypto.createHash("sha256").update(value).digest();
  return crypto.timingSafeEqual(digest(a), digest(b)) && a.length === b.length;
};

/**
 * Twilio signs a delivery report with HMAC-SHA1 over the full address it called, followed by every form field as
 * name then value in name order, keyed with the account auth token (base64 in X-Twilio-Signature).
 */
export function verifyTwilioSignature(authToken: string, url: string, params: URLSearchParams, signature: string | null) {
  if (!authToken || !signature) return false;
  const names = [...new Set([...params.keys()])].sort();
  const data = names.reduce((text, name) => text + name + params.getAll(name).join(""), url);
  const expected = crypto.createHmac("sha1", authToken).update(data, "utf8").digest("base64");
  return safeEqual(signature, expected);
}

/** MSG91 does not sign delivery reports; the address the operator gives it carries a secret token. */
export function verifyUrlToken(secret: string, token: string | null) {
  return Boolean(secret && token && safeEqual(token, secret));
}
