import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { countWorkingMethods } from "@/lib/authMethods/workingMethods";
import { loadLoginMethods } from "@/lib/loginMethods";
import { checkSmsCode, requestSmsCode } from "./codes";
import { maskPhone, parsePhone } from "./phone";

export type PhoneResult = { ok: true } | { ok: false; error: string };

const NOT_AVAILABLE = "Phone codes aren't available here.";
const BAD_NUMBER = "Enter the number with its country code, such as +91 98765 43210.";

async function eligible(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } });
  if (!user) return NOT_AVAILABLE;
  if (user.isSuperAdmin) return "Super-admin accounts sign in with a password only.";
  return (await loadLoginMethods()).available.includes("phone") ? null : NOT_AVAILABLE;
}

/** What the account page shows: whether phone codes exist here, and the saved number masked, never in full. */
export async function loadPhoneCard(userId: string) {
  const [user, login] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { phoneE164: true, phoneVerifiedAt: true, isSuperAdmin: true } }),
    loadLoginMethods(),
  ]);
  const saved = user?.phoneE164 && user.phoneVerifiedAt ? maskPhone(user.phoneE164) : null;
  return { available: !user?.isSuperAdmin && login.available.includes("phone"), maskedPhone: saved };
}

/** Text a code to a number the person wants to add or change to. Nothing is saved until the code is confirmed. */
export async function startPhoneVerification(userId: string, phoneInput: unknown): Promise<PhoneResult> {
  const refusal = await eligible(userId);
  if (refusal) return { ok: false, error: refusal };
  const phone = parsePhone(phoneInput);
  if (!phone) return { ok: false, error: BAD_NUMBER };
  const result = await requestSmsCode({ purpose: "VERIFY", phone, userId });
  return result.ok ? { ok: true } : { ok: false, error: "Too many codes have been asked for this number or country. Try again later." };
}

/** Check the code and save the number as the account's verified phone, replacing any earlier one. Audited without the number. */
export async function confirmPhone(userId: string, phoneInput: unknown, code: string): Promise<PhoneResult> {
  const refusal = await eligible(userId);
  if (refusal) return { ok: false, error: refusal };
  const phone = parsePhone(phoneInput);
  if (!phone) return { ok: false, error: BAD_NUMBER };
  if (!(await checkSmsCode({ purpose: "VERIFY", phone, code, consume: true, userId })).ok) return { ok: false, error: "That code didn't match or has expired. Ask for a new one." };
  try {
    const before = await prisma.user.findUnique({ where: { id: userId }, select: { phoneE164: true } });
    await prisma.user.update({ where: { id: userId }, data: { phoneE164: phone.e164, phoneVerifiedAt: new Date() } });
    await recordAuditEvent({ action: "PHONE_ADDED", actorUserId: userId, targetType: "User", targetId: userId, metadata: { replaced: Boolean(before?.phoneE164) } });
  } catch (error) {
    // The number is already verified on another account: one number, one account.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, error: "This number can't be added to your account." };
    throw error;
  }
  return { ok: true };
}

/** Remove the phone, unless phone codes are the last working way to sign in. Audited without the number. */
export async function removePhone(userId: string): Promise<PhoneResult> {
  const login = await loadLoginMethods();
  const removed = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    if (login.available.includes("phone") && (await countWorkingMethods(userId, { phone: true }, tx, login)) < 1) return "last" as const;
    const gone = await tx.user.updateMany({ where: { id: userId, phoneE164: { not: null } }, data: { phoneE164: null, phoneVerifiedAt: null } });
    return gone.count === 1 ? "done" as const : "none" as const;
  });
  if (removed === "last") return { ok: false, error: "Add another way to sign in before removing your phone." };
  if (removed === "none") return { ok: false, error: "There's no phone number on this account." };
  await recordAuditEvent({ action: "PHONE_REMOVED", actorUserId: userId, targetType: "User", targetId: userId });
  return { ok: true };
}
