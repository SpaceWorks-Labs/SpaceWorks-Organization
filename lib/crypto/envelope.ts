import crypto from "crypto";

/**
 * The one AES-256-GCM envelope every stored secret uses: "v1.<iv>.<tag>.<ciphertext>", each part base64url, a fresh
 * 12-byte IV, optional additional authenticated data. The wrappers (lib/mfa.ts, lib/instanceConfigSecrets.ts,
 * lib/orgSecrets.ts, lib/payments/secrets.ts) choose the key and the binding; the format must never change, because
 * existing ciphertext in the database has to keep opening (tests/unit/crypto-envelope.test.ts holds fixtures).
 */

/** A 32-byte key from standard base64, or null when the text is not exactly that. */
export function parseBase64Key(raw: string): Buffer | null {
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32 || key.toString("base64").replace(/=+$/, "") !== raw.replace(/=+$/, "")) return null;
  return key;
}

/** A domain-separated subkey, so one secret key never opens ciphertext made for another purpose. */
export function deriveKey(base: Buffer, info: string): Buffer {
  return Buffer.from(crypto.hkdfSync("sha256", base, Buffer.alloc(0), info, 32));
}

export function sealEnvelope(value: string, key: Buffer, aad?: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  if (aad !== undefined) cipher.setAAD(Buffer.from(aad, "utf8"));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

/** Throws `Error(invalidMessage)` for a malformed value; a wrong key, binding or tampering throws from the cipher. */
export function openEnvelope(value: string, key: Buffer, invalidMessage: string, aad?: string): string {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error(invalidMessage);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  if (aad !== undefined) decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
