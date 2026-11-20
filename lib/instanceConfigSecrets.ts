import "server-only";

import { deriveKey, openEnvelope, parseBase64Key, sealEnvelope } from "@/lib/crypto/envelope";

function encryptionKey() {
  const key = parseBase64Key(process.env.MFA_ENCRYPTION_KEY ?? "");
  if (!key) throw new Error("MFA_ENCRYPTION_KEY must be valid base64 for a 32-byte key.");
  // A domain-separated subkey prevents configuration ciphertext from being
  // interchangeable with MFA seed ciphertext.
  return deriveKey(key, "spaceworks-org-instance-service-settings-v1");
}

export function encryptInstanceConfigSecret(value: string) {
  return sealEnvelope(value, encryptionKey());
}

export function decryptInstanceConfigSecret(value: string) {
  return openEnvelope(value, encryptionKey(), "Invalid encrypted instance configuration secret.");
}
