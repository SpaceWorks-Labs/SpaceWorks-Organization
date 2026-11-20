import "server-only";

import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { consumeRecoveryCode, decryptMfaSecret, consumeMfaCode } from "@/lib/mfa";
import { consumeLoginCode, issueLoginCode, justVerified, recognisedDevice, rememberDevice } from "@/lib/loginSecurity";
import { isIpBlocked, recordFailedLogin } from "@/lib/ipBlock";
import { getClientIpFromHeaders } from "@/lib/rateLimit";
import { isEmailServiceConfigured } from "@/lib/emailAvailability";
import { clearSignInFailures, recordSignInFailure, signInWaitSeconds } from "@/lib/signInBackoff";
import { auditRecoveryCodeUsed, auditSignInFailed } from "@/lib/authAudit";
import { SignInError, methodDisabled, throttled } from "./errors";
import { isSwitchedOff, type AuthContext, type AuthMethodModule } from "./types";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
  totp: z.string().trim().max(32).optional(),
  emailCode: z.string().trim().max(12).optional(),
});

// Equal bcrypt work for missing and provider-only accounts prevents the obvious timing oracle. A fixed non-secret dummy hash.
const DUMMY_HASH = "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW";

/**
 * Auth.js Credentials `authorize` for email and password. The second factor is a distinct step, shown only after the
 * password is right: `mfa_required`, or `email_code_required` for a new browser (skipped when no email service
 * exists, so nobody is locked out). Failures count towards the address block (lib/ipBlock.ts) and the per-account
 * delay (lib/signInBackoff.ts); both apply the same way to accounts that do not exist.
 */
export async function authorizePassword(raw: unknown, request: Request, context: AuthContext) {
  const parsed = credentialsSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { email, password } = parsed.data;
  const ip = getClientIpFromHeaders(request.headers);
  if (await isIpBlocked(ip)) throw new SignInError("address_blocked");
  if ((await signInWaitSeconds(email)) > 0) {
    await auditSignInFailed("password", "throttled");
    throw throttled();
  }
  // Every wrong password or code counts towards blocking the address and delaying the account.
  const fail = async (reason: string) => {
    await auditSignInFailed("password", reason);
    await recordSignInFailure(email);
    if (await recordFailedLogin(ip)) throw new SignInError("address_blocked");
    return null;
  };
  if (await isActionRateLimited("auth", email)) return null;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, image: true, passwordHash: true, sessionVersion: true, emailVerified: true, mfaSecretEncrypted: true, isSuperAdmin: true },
  });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user?.passwordHash || !ok) return fail("bad_credentials");
  // Switched off, password sign-in still works for super admins and for nobody else.
  if (isSwitchedOff(context, "password") && !user.isSuperAdmin) {
    await auditSignInFailed("password", "method_disabled");
    throw methodDisabled();
  }
  if (!user.emailVerified) throw new SignInError("email_verification_required");

  const known = await recognisedDevice(user.id);
  if (user.mfaSecretEncrypted) {
    const code = parsed.data.totp ?? "";
    if (!user.email) return null;
    if (!code) throw new SignInError("mfa_required");
    const validTotp = await consumeMfaCode(decryptMfaSecret(user.mfaSecretEncrypted), user.email, code);
    if (!validTotp) {
      if (!(await consumeRecoveryCode(user.id, code))) return fail("bad_second_step");
      await auditRecoveryCodeUsed(user.id);
    }
  } else if (!known && !justVerified(user.emailVerified) && user.email && (await isEmailServiceConfigured())) {
    // Unusual sign-in: a browser this account hasn't used. Prove the inbox with an emailed code (only when we can send one).
    const emailCode = parsed.data.emailCode ?? "";
    if (!emailCode) {
      await issueLoginCode({ id: user.id, email: user.email });
      throw new SignInError("email_code_required");
    }
    if (!(await consumeLoginCode(user.id, emailCode))) return fail("bad_email_code");
  }
  await clearSignInFailures(email);
  await rememberDevice(user.id, known);
  return { id: user.id, name: user.name, email: user.email, image: user.image, sessionVersion: user.sessionVersion };
}

export const passwordMethod: AuthMethodModule = (context) => ({
  providers: [
    Credentials({
      id: "credentials",
      name: "Email and password",
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
      authorize: (raw, request) => authorizePassword(raw, request, context),
    }),
  ],
});
