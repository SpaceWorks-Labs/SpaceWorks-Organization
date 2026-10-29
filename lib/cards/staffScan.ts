import "server-only";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can, organisationAllows } from "@/lib/permissionRoles";
import { getMembership, hasAuthenticator } from "@/lib/permissions";
import { teamScope, unitInScope } from "@/lib/membership/scope";
import { cardState, VERIFY_TOKEN_PATTERN } from "./core";

/*
 * Staff who scan a card of their own organisation: a team member (or a super admin through platform access) who
 * reads members there, with the member inside their unit scope. Everyone else, including staff of another
 * organisation and staff limited to another unit, gets null and sees only the public check, so the page never
 * hints that the person is a member anywhere else.
 */
export async function staffScanAccess(token: string) {
  if (!VERIFY_TOKEN_PATTERN.test(token)) return null;
  const userId = (await auth())?.user?.id;
  if (!userId) return null;
  const card = await prisma.memberCard.findUnique({
    where: { verifyToken: token },
    select: {
      id: true, cardNumber: true, revokedAt: true, revokedReason: true, organisationId: true, memberId: true,
      organisation: { select: { slug: true, status: true } },
      member: { select: { anonymisedAt: true, unit: { select: { path: true } } } },
    },
  });
  if (!card || card.member.anonymisedAt) return null;
  const membership = await getMembership(userId, card.organisationId);
  if (!membership || !organisationAllows(card.organisation.status, "members.view") || !can(membership, "members.view")) return null;
  if (!unitInScope(await teamScope(card.organisationId, membership.unitId), card.member.unit?.path ?? null)) return null;
  return {
    userId,
    organisationId: card.organisationId,
    orgSlug: card.organisation.slug,
    memberId: card.memberId,
    card: { id: card.id, number: card.cardNumber, state: cardState(card) },
    authenticator: await hasAuthenticator(userId),
  };
}
