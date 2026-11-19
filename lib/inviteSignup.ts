import "server-only";

import { prisma } from "@/lib/db";
import { isNewUserRegistrationEnabled } from "@/lib/instanceSettings";
import { readInviteCookie } from "@/lib/inviteCookie";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Whether an invite can still be used to join: it exists, is unused and unexpired, is for this email if it is bound
 * to one, and has not already created an account for someone else (one account per invite while sign-ups are off).
 */
export async function inviteIsOpen(token: string, email?: string | null) {
  const invite = await prisma.teamInvite.findUnique({ where: { token }, select: { email: true, usedAt: true, expiresAt: true, signupEmail: true } });
  if (!invite || invite.usedAt || (invite.expiresAt && invite.expiresAt <= new Date())) return false;
  if (invite.signupEmail && (!email || !same(invite.signupEmail, email))) return false;
  if (!invite.email) return true;
  return !!email && same(invite.email, email);
}

/**
 * Claims this browser’s invite for creating the account of `email` while sign-ups are off, or returns null. The claim
 * is one atomic update, so an invite creates an account for one email only, however many browsers hold the link;
 * retries for the same email still succeed. Call it only at the point an account is about to be created.
 */
export async function reserveInviteSignup(email: string): Promise<string | null> {
  const token = await readInviteCookie();
  if (!token || !(await inviteIsOpen(token, email))) return null;
  const address = email.trim().toLowerCase();
  const claimed = await prisma.teamInvite.updateMany({
    where: { token, usedAt: null, OR: [{ signupEmail: null }, { signupEmail: address }] },
    data: { signupEmail: address },
  });
  return claimed.count === 1 ? token : null;
}

/**
 * The invite this browser may create an account through, or null. The cookie only says which invite the visitor
 * started from; the database decides whether it still works. Never grants anything beyond account creation.
 */
export async function inviteSignupToken(email: string): Promise<string | null> {
  const token = await readInviteCookie();
  return token && (await inviteIsOpen(token, email)) ? token : null;
}

/**
 * Whether a new account may be created for this email now: sign-ups are on, or a valid invite vouches for it (and is
 * claimed for this email). Call it only where an account is about to be created.
 */
export async function mayCreateAccount(email: string) {
  return (await isNewUserRegistrationEnabled()) || (await reserveInviteSignup(email)) !== null;
}

/** Whether this browser started from a still-open invite that is bound to a different email (for a clear refusal). */
export async function inviteBoundToOtherEmail(email: string) {
  const token = await readInviteCookie();
  if (!token) return false;
  const invite = await prisma.teamInvite.findUnique({ where: { token }, select: { email: true, usedAt: true, expiresAt: true } });
  if (!invite?.email || invite.usedAt || (invite.expiresAt && invite.expiresAt <= new Date())) return false;
  return invite.email.trim().toLowerCase() !== email.trim().toLowerCase();
}
