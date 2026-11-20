import "server-only";

import { deriveKey, openEnvelope, parseBase64Key, sealEnvelope } from "@/lib/crypto/envelope";

/** Thrown when gateway keys are saved or used without PAYMENT_SECRETS_KEY configured. */
export class PaymentSecretsUnavailable extends Error {
  override name = "PaymentSecretsUnavailable";
  constructor() {
    super("Online payments need PAYMENT_SECRETS_KEY set on the server (32 random bytes, base64).");
  }
}

export function paymentSecretsConfigured() {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}

function encryptionKey() {
  const key = parseBase64Key(process.env.PAYMENT_SECRETS_KEY ?? "");
  if (!key) throw new PaymentSecretsUnavailable();
  // Domain separation keeps gateway ciphertext from being usable anywhere else the key might be reused.
  return deriveKey(key, "spaceworks-org-payment-secrets-v1");
}

/** AES-256-GCM, bound to the organisation so a ciphertext copied to another tenant will not decrypt. */
export function encryptPaymentSecret(value: string, organisationId: string) {
  return sealEnvelope(value, encryptionKey(), organisationId);
}

export function decryptPaymentSecret(value: string, organisationId: string) {
  return openEnvelope(value, encryptionKey(), "Invalid encrypted payment secret.", organisationId);
}
