import "server-only";

import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { consumeRecoveryCode, consumeMfaCode, decryptMfaSecret } from "@/lib/mfa";
import { recognisedDevice, rememberDevice } from "@/lib/loginSecurity";
import { isIpBlocked, recordFailedLogin } from "@/lib/ipBlock";
import { getClientIpFromHeaders } from "@/lib/rateLimit";
import { clearSignInFailures, recordSignInFailure, signInWaitSeconds } from "@/lib/signInBackoff";
import { auditRecoveryCodeUsed, auditSignInFailed } from "@/lib/authAudit";
import { clearSignInCookie, consumeChallenge, discardChallenge, peekChallenge, signInChallengeKey } from "@/lib/passkeys/challenges";
import { verifyAssertion } from "@/lib/passkeys/verify";
import { SignInError, methodDisabled, throttled } from "./errors";
import { isSwitchedOff, type AuthContext, type AuthMethodModule } from "./types";

const inputSchema = z.object({
  response: z.string().min(1).max(20_000),
  totp: z.string().trim().max(32).optional(),
});

const assertionSchema = z.object({ id: z.string().min(1).max(1400), rawId: z.string(), type: z.literal("public-key"), response: z.object({}).passthrough() }).passthrough();

/**
 * Auth.js Credentials `authorize` for passkeys. The page asked for options (app/actions/passkey-sign-in.ts), which
 * stored a challenge named by an opaque cookie; this checks the browser's answer against it. The passkey is looked up
 * by its credential id (discoverable credentials, no email typed), verified with user verification required, its
 * counter checked and updated, and the challenge used up exactly once.
 *
 * A passkey with user verification counts as two steps for members. Staff with an authenticator still give its code
 * (`mfa_required`): the challenge is kept for that second call, and used up only when the whole sign-in succeeds.
 * Super admins never use passkeys. Failures count towards the address block and the per-account delay.
 */
export async function authorizePasskey(raw: unknown, request: Request, context: AuthContext) {
  if (isSwitchedOff(context, "passkey")) {
    await auditSignInFailed("passkey", "method_disabled");
    throw methodDisabled();
  }
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return null;
  const ip = getClientIpFromHeaders(request.headers);
  if (await isIpBlocked(ip)) throw new SignInError("address_blocked");

  const key = await signInChallengeKey();
  const fail = async (reason: string, email?: string | null) => {
    if (key) await discardChallenge(key);
    await auditSignInFailed("passkey", reason);
    if (email) await recordSignInFailure(email);
    if (await recordFailedLogin(ip)) throw new SignInError("address_blocked");
    return null;
  };
  if (await isActionRateLimited("auth")) return null;

  let response: AuthenticationResponseJSON;
  try {
    response = assertionSchema.parse(JSON.parse(parsed.data.response)) as unknown as AuthenticationResponseJSON;
  } catch { return fail("bad_assertion"); }
  const challenge = key ? await peekChallenge(key, "sign-in") : null;
  if (!key || !challenge) return fail("challenge_expired");

  const passkey = await prisma.passkey.findUnique({
    where: { credentialId: response.id },
    select: { id: true, credentialId: true, publicKey: true, counter: true, transports: true, user: { select: { id: true, name: true, email: true, image: true, sessionVersion: true, emailVerified: true, mfaSecretEncrypted: true, isSuperAdmin: true, _count: { select: { teamMembers: true } } } } },
  });
  if (!passkey) return fail("unknown_credential");
  const user = passkey.user;
  if (user.isSuperAdmin) return fail("super_admin_password_only");
  if (!user.email || !user.emailVerified) return fail("email_unverified");
  if ((await signInWaitSeconds(user.email)) > 0) {
    await auditSignInFailed("passkey", "throttled");
    throw throttled();
  }

  const verified = await verifyAssertion(response, challenge, { credentialId: passkey.credentialId, publicKey: passkey.publicKey, counter: Number(passkey.counter), transports: passkey.transports });
  if (!verified.ok) {
    if (verified.reason === "counter_rollback") {
      await recordAuditEvent({ action: "PASSKEY_COUNTER_ROLLBACK", actorUserId: user.id, targetType: "Passkey", targetId: passkey.id }).catch(() => undefined);
    }
    return fail(verified.reason, user.email);
  }

  // Staff with an authenticator still give its code; a passkey does not replace it for them. Members never need one.
  if (user.mfaSecretEncrypted && user._count.teamMembers > 0) {
    const code = parsed.data.totp ?? "";
    if (!code) throw new SignInError("mfa_required");
    const validTotp = await consumeMfaCode(decryptMfaSecret(user.mfaSecretEncrypted), user.email, code);
    if (!validTotp) {
      if (!(await consumeRecoveryCode(user.id, code))) return fail("bad_second_step", user.email);
      await auditRecoveryCodeUsed(user.id);
    }
  }
  if (!(await consumeChallenge(key))) return fail("challenge_reused", user.email);
  await clearSignInCookie();

  await prisma.passkey.update({ where: { id: passkey.id }, data: { counter: BigInt(verified.newCounter), lastUsedAt: new Date(), backedUp: verified.backedUp, deviceType: verified.deviceType } });
  await clearSignInFailures(user.email);
  await rememberDevice(user.id, await recognisedDevice(user.id));
  return { id: user.id, name: user.name, email: user.email, image: user.image, sessionVersion: user.sessionVersion };
}

export const passkeyMethod: AuthMethodModule = (context) => ({
  providers: [
    Credentials({
      id: "passkey",
      name: "Passkey",
      credentials: { response: { type: "text" }, totp: { type: "text" } },
      authorize: (raw, request) => authorizePasskey(raw, request, context),
    }),
  ],
});
