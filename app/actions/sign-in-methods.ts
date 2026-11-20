"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";
import { hasRecentAuthentication } from "@/lib/reauth";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { auditIdentityUnlinked } from "@/lib/authAudit";
import { setLinkIntent } from "@/lib/linkSession";
import { listLinkableMethods, type LinkableMethod } from "@/lib/authMethods/linkable";
import { countWorkingMethods } from "@/lib/authMethods/workingMethods";
import type { ActionResult } from "./org";

const providerSchema = z.object({ provider: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) });
const accountSchema = z.object({ accountId: z.string().min(1).max(64) });

/**
 * Start adding a sign-in method to the signed-in account (product rules section 15). Only from a live, recent session,
 * only for a method that is on, and never for a super admin (password only). It sets a signed link intent that lasts
 * ten minutes and names this user and this provider; the sign-in callback links the identity to that user and nobody else.
 */
export async function beginLinkSignInMethod(input: unknown): Promise<ActionResult<{ method: LinkableMethod }>> {
  const session = await requireAuth();
  const parsed = providerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That sign-in method is not available." };
  if (await isActionRateLimited("auth", session.user.id)) return { ok: false, error: "Too many attempts. Try again later." };
  if (!(await hasRecentAuthentication())) return { ok: false, error: "Sign in again before adding a sign-in method." };
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isSuperAdmin: true } });
  if (!user || user.isSuperAdmin) return { ok: false, error: "Super-admin accounts sign in with a password only." };
  const method = (await listLinkableMethods()).find((entry) => entry.provider === parsed.data.provider);
  if (!method) return { ok: false, error: "That sign-in method is not available." };
  await setLinkIntent({ userId: session.user.id, provider: method.provider });
  return { ok: true, data: { method } };
}

/** Remove a linked identity, unless it is the last working way to sign in. Passkeys and phone codes have their own cards. */
export async function unlinkSignInMethod(input: unknown): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That sign-in method could not be found." };
  if (await isActionRateLimited("auth", session.user.id)) return { ok: false, error: "Too many attempts. Try again later." };
  if (!(await hasRecentAuthentication())) return { ok: false, error: "Sign in again before removing a sign-in method." };
  const account = await prisma.account.findFirst({ where: { id: parsed.data.accountId, userId: session.user.id }, select: { id: true, provider: true } });
  if (!account) return { ok: false, error: "That sign-in method could not be found." };
  const removed = await prisma.$transaction(async (tx) => {
    // One removal at a time per person, so two at once cannot each see the other still there.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${session.user.id} FOR UPDATE`;
    if ((await countWorkingMethods(session.user.id, { accountId: account.id }, tx)) < 1) return false;
    const gone = await tx.account.deleteMany({ where: { id: account.id, userId: session.user.id } });
    return gone.count === 1;
  });
  if (!removed) return { ok: false, error: "Add another way to sign in before removing this one." };
  await auditIdentityUnlinked(session.user.id, account.provider);
  return { ok: true };
}
