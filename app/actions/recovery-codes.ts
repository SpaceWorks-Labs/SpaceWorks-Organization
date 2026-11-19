"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";
import { hasRecentAuthentication } from "@/lib/reauth";
import { consumeMfaCode, decryptMfaSecret, generateRecoveryCodes, hashRecoveryCode } from "@/lib/mfa";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import type { ActionResult } from "./org";

const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/) });

/**
 * Replace every recovery code with a fresh set (product rules section 15). Needs the authenticator's current code, not
 * a recovery code, so someone holding only one old code cannot mint more. The old codes stop working at once; the
 * new ones are shown once and stored only as hashes. The authenticator rule for staff is untouched.
 */
export async function regenerateRecoveryCodes(input: unknown): Promise<ActionResult<{ recoveryCodes: string[] }>> {
  const session = await requireAuth();
  if (await isActionRateLimited("auth", session.user.id)) return { ok: false, error: "Too many attempts. Please try again later." };
  const parsed = codeSchema.safeParse(input);
  if (!parsed.success || !session.user.email) return { ok: false, error: "Enter the six-digit code from your authenticator app." };
  if (!(await hasRecentAuthentication())) return { ok: false, error: "Sign in again before replacing recovery codes." };
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { mfaSecretEncrypted: true } });
  if (!user?.mfaSecretEncrypted) return { ok: false, error: "Turn on two-step sign-in first." };
  if (!(await consumeMfaCode(decryptMfaSecret(user.mfaSecretEncrypted), session.user.email, parsed.data.code))) return { ok: false, error: "Invalid authenticator code." };
  const recoveryCodes = generateRecoveryCodes();
  const replaced = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${session.user.id} FOR UPDATE`;
    const updated = await tx.user.updateMany({ where: { id: session.user.id, mfaSecretEncrypted: user.mfaSecretEncrypted }, data: { recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode) } });
    if (updated.count !== 1) return false;
    await tx.auditEvent.create({ data: { action: "RECOVERY_CODES_REGENERATED", actorUserId: session.user.id, targetType: "User", targetId: session.user.id } });
    return true;
  });
  if (!replaced) return { ok: false, error: "Account security changed. Try again." };
  return { ok: true, data: { recoveryCodes } };
}
