import "server-only";

import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { consumeMfaCode, consumeRecoveryCode, decryptMfaSecret } from "@/lib/mfa";
import { recognisedDevice, rememberDevice } from "@/lib/loginSecurity";
import { isIpBlocked, recordFailedLogin } from "@/lib/ipBlock";
import { getClientIpFromHeaders } from "@/lib/rateLimit";
import { clearSignInFailures, recordSignInFailure, signInWaitSeconds } from "@/lib/signInBackoff";
import { auditRecoveryCodeUsed, auditSignInFailed } from "@/lib/authAudit";
import { checkSmsCode } from "@/lib/sms/codes";
import { parsePhone, phoneHash } from "@/lib/sms/phone";
import { SignInError, methodDisabled, throttled } from "./errors";
import type { AuthContext, AuthMethodModule } from "./types";

const credentialsSchema = z.object({
  phone: z.string().trim().max(40),
  code: z.string().trim().max(12),
  totp: z.string().trim().max(32).optional(),
});

/**
 * Auth.js Credentials `authorize` for a phone code (product rules section 15). Only a verified number on an
 * existing account signs in; nothing here creates an account, and super admins are refused. The code is checked
 * first, so a wrong code never reveals anything; an account with an authenticator then needs its code too (a phone
 * is one factor, and the code stays valid for that step). Failures count towards the address block and the per-number
 * delay exactly as for passwords, and the same for numbers with no account. Independent of email, so it works
 * without an email service.
 */
export async function authorizePhone(raw: unknown, request: Request, context: AuthContext) {
  const parsed = credentialsSchema.safeParse(raw);
  const phone = parsed.success ? parsePhone(parsed.data.phone) : null;
  if (!parsed.success || !phone) return null;
  const ip = getClientIpFromHeaders(request.headers);
  if (await isIpBlocked(ip)) throw new SignInError("address_blocked");
  if (!context.available.includes("phone")) {
    await auditSignInFailed("phone", "method_disabled");
    throw methodDisabled();
  }
  const subject = `phone:${phoneHash(phone.e164)}`;
  if ((await signInWaitSeconds(subject)) > 0) {
    await auditSignInFailed("phone", "throttled");
    throw throttled();
  }
  const fail = async (reason: string) => {
    await auditSignInFailed("phone", reason);
    await recordSignInFailure(subject);
    if (await recordFailedLogin(ip)) throw new SignInError("address_blocked");
    return null;
  };
  if (await isActionRateLimited("auth", subject)) return null;

  const user = await prisma.user.findFirst({
    where: { phoneE164: phone.e164, phoneVerifiedAt: { not: null } },
    select: { id: true, name: true, email: true, image: true, sessionVersion: true, mfaSecretEncrypted: true, isSuperAdmin: true },
  });
  // The code is always checked, even for a number with no account, so the cost and the answer are the same.
  const checked = await checkSmsCode({ purpose: "SIGN_IN", phone, code: parsed.data.code, consume: !user?.mfaSecretEncrypted });
  if (!user || !checked.ok || checked.userId !== user.id) return fail("bad_code");
  if (user.isSuperAdmin) return fail("not_allowed");

  const known = await recognisedDevice(user.id);
  if (user.mfaSecretEncrypted) {
    const second = parsed.data.totp ?? "";
    if (!user.email) return null;
    if (!second) throw new SignInError("mfa_required");
    const validTotp = await consumeMfaCode(decryptMfaSecret(user.mfaSecretEncrypted), user.email, second);
    if (!validTotp) {
      if (!(await consumeRecoveryCode(user.id, second))) return fail("bad_second_step");
      await auditRecoveryCodeUsed(user.id);
    }
    if (!(await checkSmsCode({ purpose: "SIGN_IN", phone, code: parsed.data.code, consume: true })).ok) return fail("bad_code");
  }
  await clearSignInFailures(subject);
  await rememberDevice(user.id, known);
  return { id: user.id, name: user.name, email: user.email, image: user.image, sessionVersion: user.sessionVersion };
}

export const phoneMethod: AuthMethodModule = (context) => ({
  providers: [
    Credentials({
      id: "phone",
      name: "Phone code",
      credentials: { phone: { label: "Phone number", type: "tel" }, code: { label: "Code", type: "text" } },
      authorize: (raw, request) => authorizePhone(raw, request, context),
    }),
  ],
});
