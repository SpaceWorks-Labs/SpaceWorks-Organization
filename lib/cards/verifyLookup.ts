import "server-only";

import { prisma } from "@/lib/db";
import { VERIFY_TOKEN_PATTERN } from "./core";
import { managedImageUrl, memberPhotoUrl } from "./imageUrl";
import { verificationView, type VerifyView } from "./verify";

/** Look a verify token up and reduce it to what the public page may show. */
export async function lookupVerification(token: string, now = new Date()): Promise<VerifyView> {
  if (!VERIFY_TOKEN_PATTERN.test(token)) return { state: "not-found" };
  const card = await prisma.memberCard.findUnique({
    where: { verifyToken: token },
    select: {
      cardNumber: true, revokedAt: true, revokedReason: true, organisationId: true, planId: true,
      plan: { select: { name: true } },
      organisation: { select: { name: true, slug: true, status: true, timezone: true, logoUrl: true } },
      member: {
        select: {
          id: true, name: true, anonymisedAt: true, photoUrl: true, organisationId: true,
          user: { select: { id: true, profileImageUrl: true } },
          terms: { select: { id: true, planId: true, status: true, startsAt: true, endsAt: true, graceUntil: true, paymentDueBy: true, renewedFromId: true, createdAt: true } },
        },
      },
    },
  });
  if (!card) return { state: "not-found" };
  return verificationView({
    card,
    plan: card.plan,
    organisation: { ...card.organisation, logoUrl: managedImageUrl(card.organisation.logoUrl, { kind: "organisation", organisationId: card.organisationId, category: "organisation-logos" }) },
    member: { name: card.member.name, anonymisedAt: card.member.anonymisedAt, photoUrl: memberPhotoUrl(card.member) },
    terms: card.member.terms.filter((term) => term.planId === card.planId),
  }, now);
}
