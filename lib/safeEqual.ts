import crypto from "node:crypto";

/**
 * Constant-time comparison for secrets, signatures and codes. Both sides are compared as bytes of the same
 * `encoding`; text that is not valid in that encoding, an empty value or a difference in length never matches.
 * Plain text is hashed first, so the comparison time does not depend on where the texts differ or how long they are.
 */
export function safeEqual(a: string, b: string, encoding: "utf8" | "hex" | "base64url" = "utf8"): boolean {
  if (encoding === "utf8") {
    const digest = (value: string) => crypto.createHash("sha256").update(value, "utf8").digest();
    return crypto.timingSafeEqual(digest(a), digest(b)) && Buffer.byteLength(a) === Buffer.byteLength(b);
  }
  const valid = encoding === "hex" ? /^(?:[0-9a-f]{2})+$/i : /^[A-Za-z0-9_-]+$/;
  if (!valid.test(a) || !valid.test(b)) return false;
  const left = Buffer.from(a, encoding);
  const right = Buffer.from(b, encoding);
  // Decoding drops stray trailing characters; requiring the canonical spelling stops "value" and "valueA" matching.
  if (encoding === "base64url" && (left.toString("base64url") !== a || right.toString("base64url") !== b)) return false;
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
