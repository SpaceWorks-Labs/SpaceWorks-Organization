import "server-only";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can, organisationAllows } from "@/lib/permissionRoles";
import { getMembership, hasAuthenticator } from "@/lib/permissions";
import { teamScope, unitInScope } from "@/lib/membership/scope";

/*
 * Who may download a card: a team member of the card's organisation who manages cards (as bulk downloads require)
 * or sees members' contact details, uses an authenticator (as every staff route requires) and whose unit scope
 * includes the member, or the member themself (their linked account, or an account whose verified email is the
 * member's email). Everyone else gets the same 404.
 */

export type CardViewer = { userId: string; as: "team" | "member" };

/** Whether this account is the card's member: linked, or the same verified email. */
export async function isCardHolder(userId: string, member: { userId: string | null; email: string }) {
  if (member.userId === userId) return true;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } });
  return Boolean(user?.email && user.emailVerified && user.email.trim().toLowerCase() === member.email.trim().toLowerCase());
}

export async function authorizeCardAccess(cardId: string): Promise<CardViewer | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || !/^[A-Za-z0-9_-]{1,64}$/.test(cardId)) return null;
  const card = await prisma.memberCard.findUnique({
    where: { id: cardId },
    select: {
      organisationId: true,
      organisation: { select: { status: true } },
      member: { select: { userId: true, email: true, anonymisedAt: true, unit: { select: { path: true } } } },
    },
  });
  if (!card || card.member.anonymisedAt) return null;

  const membership = await getMembership(userId, card.organisationId);
  if (membership && organisationAllows(card.organisation.status, "members.view") && (can(membership, "cards.manage") || can(membership, "members.contact")) && (await hasAuthenticator(userId))) {
    const scope = await teamScope(card.organisationId, membership.unitId);
    if (unitInScope(scope, card.member.unit?.path ?? null)) return { userId, as: "team" };
  }
  // Members keep their card while the organisation is suspended (member data rights stay open).
  if (!["ACTIVE", "SUSPENDED", "ARCHIVED"].includes(card.organisation.status)) return null;
  if (await isCardHolder(userId, card.member)) return { userId, as: "member" };
  return null;
}
