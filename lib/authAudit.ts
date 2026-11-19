import "server-only";

import { recordAuditEvent, recordThrottledAuditEvent } from "@/lib/audit";

/** The method a provider id belongs to, for audit rows: "credentials" is the password form. */
export function methodOfProvider(provider: string) {
  return provider === "credentials" ? "password" : provider;
}

/** Audit rows for sign-in (product rules section 15). Never the credential, an email or a token. Never throws. */
export async function auditSignInSucceeded(userId: string, provider: string) {
  await recordAuditEvent({ action: "SIGN_IN_SUCCEEDED", actorUserId: userId, targetType: "User", targetId: userId, metadata: { method: methodOfProvider(provider) } }).catch(() => undefined);
}

/**
 * A failed sign-in records the method and a reason code only. One row per method and reason a minute, so a guessing
 * run cannot flood the log; the per-address and per-account limits do the counting.
 */
export async function auditSignInFailed(provider: string, reason: string) {
  const method = methodOfProvider(provider);
  await recordThrottledAuditEvent({ action: "SIGN_IN_FAILED", actorUserId: null, targetType: "SignInMethod", targetId: `${method}:${reason}`, metadata: { method, reason }, windowMs: 60_000 }).catch(() => undefined);
}

export async function auditSignedOut(userId: string) {
  await recordAuditEvent({ action: "SIGN_OUT", actorUserId: userId, targetType: "User", targetId: userId }).catch(() => undefined);
}

export async function auditRecoveryCodeUsed(userId: string) {
  await recordAuditEvent({ action: "RECOVERY_CODE_USED", actorUserId: userId, targetType: "User", targetId: userId }).catch(() => undefined);
}

export async function auditIdentityLinked(userId: string, provider: string) {
  await recordAuditEvent({ action: "IDENTITY_LINKED", actorUserId: userId, targetType: "User", targetId: userId, metadata: { method: methodOfProvider(provider) } }).catch(() => undefined);
}

export async function auditIdentityUnlinked(userId: string, provider: string) {
  await recordAuditEvent({ action: "IDENTITY_UNLINKED", actorUserId: userId, targetType: "User", targetId: userId, metadata: { method: methodOfProvider(provider) } }).catch(() => undefined);
}

/** One signed-in device was ended from the security page. Method only, never the device label or address. */
export async function auditSessionRevoked(userId: string, method: string) {
  await recordAuditEvent({ action: "SESSION_REVOKED", actorUserId: userId, targetType: "User", targetId: userId, metadata: { method } }).catch(() => undefined);
}
