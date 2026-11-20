import "server-only";

import { deriveKey, openEnvelope, parseBase64Key, sealEnvelope } from "@/lib/crypto/envelope";
import { PaymentSecretsUnavailable } from "@/lib/payments/secrets";

/**
 * Organisation secrets other than gateway keys (SMTP passwords, chat webhooks and tokens), encrypted with the
 * same PAYMENT_SECRETS_KEY but a key derived per purpose, and bound to the organisation, so a ciphertext copied
 * to another tenant or another purpose will not decrypt.
 */
type OrgSecretPurpose = "email" | "chat" | "messaging";

function key(purpose: OrgSecretPurpose) {
  const base = parseBase64Key(process.env.PAYMENT_SECRETS_KEY ?? "");
  if (!base) throw new PaymentSecretsUnavailable();
  return deriveKey(base, `spaceworks-org-${purpose}-secrets-v1`);
}

export function encryptOrgSecret(value: string, organisationId: string, purpose: OrgSecretPurpose) {
  return sealEnvelope(value, key(purpose), `${purpose}:${organisationId}`);
}

export function decryptOrgSecret(value: string, organisationId: string, purpose: OrgSecretPurpose) {
  return openEnvelope(value, key(purpose), "Invalid encrypted organisation secret.", `${purpose}:${organisationId}`);
}
