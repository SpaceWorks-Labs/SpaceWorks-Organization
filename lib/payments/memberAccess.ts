import "server-only";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { payLinkTermId } from "./payLink";

/**
 * The signed-in person's own term: reached through their VERIFIED email matching the organisation's member
 * record, never by id alone, and only where the organisation has member accounts (`memberPortal`; without them,
 * members pay through signed pay links). Null when it isn't theirs (treated as not found).
 */
export async function ownTerm(termId: string) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, name: true, email: true, emailVerified: true } });
  if (!user?.email || !user.emailVerified) return null;
  const term = await prisma.membershipTerm.findFirst({
    where: { id: termId, member: { email: user.email.toLowerCase(), anonymisedAt: null }, organisation: { memberPortal: true } },
    select: { id: true, organisationId: true, memberId: true, currency: true, member: { select: { name: true, email: true } } },
  });
  return term ? { user, term } : null;
}

/** The signed-in person's own payment, by the same rule. */
export async function ownPayment(paymentId: string) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true, emailVerified: true } });
  if (!user?.email || !user.emailVerified) return null;
  return prisma.payment.findFirst({ where: { id: paymentId, member: { email: user.email.toLowerCase(), anonymisedAt: null }, organisation: { memberPortal: true } }, select: { id: true, organisationId: true, termId: true } });
}

/**
 * A membership reached through a signed pay link (lib/payments/payLink.ts), for organisations without member
 * accounts. Same shape as ownTerm, with no signed-in user.
 */
export async function payLinkTerm(token: string) {
  const termId = payLinkTermId(token);
  if (!termId) return null;
  const term = await prisma.membershipTerm.findFirst({
    where: { id: termId, member: { anonymisedAt: null } },
    select: { id: true, organisationId: true, memberId: true, currency: true, member: { select: { name: true, email: true } } },
  });
  return term ? { user: null, term } : null;
}
