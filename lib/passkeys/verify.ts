import "server-only";

import { verifyAuthenticationResponse, verifyRegistrationResponse, type AuthenticationResponseJSON, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { passkeyRelyingParty } from "./config";

/** True when a counter has gone backwards or stood still while either side counts: the sign of a cloned authenticator. */
export function counterRolledBack(stored: number, received: number) {
  return (stored > 0 || received > 0) && received <= stored;
}

/**
 * Check a registration response against the challenge we issued: exact origin, our relying party id, and user
 * verification required (PIN, fingerprint or face). Returns the credential to store, or a reason code.
 */
export async function verifyRegistration(response: RegistrationResponseJSON, challenge: string) {
  const { origin, rpID } = passkeyRelyingParty();
  try {
    const result = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserPresence: true, requireUserVerification: true });
    if (!result.verified) return { ok: false as const, reason: "bad_attestation" };
    const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
    return { ok: true as const, credential, deviceType: credentialDeviceType as string, backedUp: credentialBackedUp };
  } catch {
    return { ok: false as const, reason: "bad_attestation" };
  }
}

export type StoredCredential = { credentialId: string; publicKey: Uint8Array; counter: number; transports: string[] };

/**
 * Check a sign-in assertion: our challenge, exact origin and relying party id, user verification required, and the
 * signature over both. The library's own counter rule is switched off (it throws an unnamed error) so a rollback can
 * be told apart, refused and audited here.
 */
export async function verifyAssertion(response: AuthenticationResponseJSON, challenge: string, stored: StoredCredential) {
  const { origin, rpID } = passkeyRelyingParty();
  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: { id: stored.credentialId, publicKey: stored.publicKey as Uint8Array<ArrayBuffer>, counter: 0, transports: stored.transports as never },
    });
    if (!result.verified) return { ok: false as const, reason: "bad_assertion" };
    const { newCounter, credentialBackedUp, credentialDeviceType } = result.authenticationInfo;
    if (counterRolledBack(stored.counter, newCounter)) return { ok: false as const, reason: "counter_rollback" };
    return { ok: true as const, newCounter, backedUp: credentialBackedUp, deviceType: credentialDeviceType as string };
  } catch {
    return { ok: false as const, reason: "bad_assertion" };
  }
}
