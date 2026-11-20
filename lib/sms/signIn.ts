import "server-only";

import { prisma } from "@/lib/db";
import { isIpBlocked } from "@/lib/ipBlock";
import { loadLoginMethods } from "@/lib/loginMethods";
import { checkRateLimitById } from "@/lib/rateLimit";
import { requestSmsCode } from "./codes";
import { parsePhone } from "./phone";

export type PhoneCodeAnswer =
  | { status: 200 }
  | { status: 400; error: "invalid_number" }
  | { status: 404; error: "method_disabled" }
  | { status: 429; retryAfterSeconds: number };

/**
 * "Send me a sign-in code" (product rules section 15). The answer for a number with an account is the same as for one
 * without, in content, status and the limits applied, so it never shows whether an account exists. Off means gone:
 * with the phone method unavailable the route refuses. Super admins and numbers not yet verified get the same answer
 * and no text.
 */
export async function startPhoneSignIn(input: { phone: unknown; ip: string }): Promise<PhoneCodeAnswer> {
  if (!(await loadLoginMethods()).available.includes("phone")) return { status: 404, error: "method_disabled" };
  if (await isIpBlocked(input.ip)) return { status: 429, retryAfterSeconds: 900 };
  if (!(await checkRateLimitById("smsCode", `ip:${input.ip}`))) return { status: 429, retryAfterSeconds: 3600 };
  const phone = parsePhone(input.phone);
  if (!phone) return { status: 400, error: "invalid_number" };
  const user = await prisma.user.findFirst({ where: { phoneE164: phone.e164, phoneVerifiedAt: { not: null }, isSuperAdmin: false }, select: { id: true } });
  const result = await requestSmsCode({ purpose: "SIGN_IN", phone, userId: user?.id ?? null });
  return result.ok ? { status: 200 } : { status: 429, retryAfterSeconds: result.retryAfterSeconds };
}
