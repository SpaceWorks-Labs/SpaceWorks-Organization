import "server-only";

import { prisma } from "@/lib/db";
import { deriveStatus, type TermStatus } from "@/lib/membership/lifecycle";
import { verifyPath } from "./core";
import { CARD_INCLUDE, cardRoleId, designFor, holderFor, loadCardOrgContext, type CardOrgContext } from "./data";
import type { CardDesign } from "./design/presets";
import type { CardBranding, CardHolder } from "./types";

/*
 * The member portal's card wallet (P8): every live card that belongs to a signed-in person, across
 * organisations. A card is theirs when its member record is linked to their account, or carries
 * their verified email. Everything here is safe to send to that person's browser; the canvas
 * (components/cards/CardCanvas.tsx) draws `design` with `holder` and `branding`.
 */

export type WalletCard = {
  cardId: string;
  memberId: string;
  planId: string;
  cardNumber: string;
  issuedAt: Date;
  organisation: { id: string; name: string; slug: string };
  planName: string;
  /** The membership's standing right now, as /verify shows it. */
  status: TermStatus | "NONE";
  design: CardDesign;
  holder: CardHolder;
  branding: CardBranding;
  verifyPath: string;
  downloads: { pdf: string; pngFront: string; pngBack: string | null };
};

export function cardDownloadPath(cardId: string, format: "pdf" | "png", side: "front" | "back" = "front") {
  return `/api/cards/${cardId}?format=${format}${format === "png" && side === "back" ? "&side=back" : ""}`;
}

/** Live cards for this account, newest first. Members of organisations that are not running are left out. */
export async function listCardsForUser(userId: string, now = new Date()): Promise<WalletCard[]> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } });
  if (!user) return [];
  const email = user.email && user.emailVerified ? user.email.trim().toLowerCase() : null;
  const cards = await prisma.memberCard.findMany({
    where: {
      revokedAt: null,
      organisation: { status: { in: ["ACTIVE", "SUSPENDED"] } },
      member: { anonymisedAt: null, OR: [{ userId }, ...(email ? [{ email }] : [])] },
    },
    include: CARD_INCLUDE,
    orderBy: { issuedAt: "desc" },
    take: 50,
  });
  const contexts = new Map<string, CardOrgContext | null>();
  const out: WalletCard[] = [];
  for (const card of cards) {
    if (!contexts.has(card.organisationId)) contexts.set(card.organisationId, await loadCardOrgContext(card.organisationId));
    const ctx = contexts.get(card.organisationId);
    if (!ctx) continue;
    const { design, branding } = designFor(ctx, card.plan, cardRoleId(card));
    out.push({
      cardId: card.id,
      memberId: card.memberId,
      planId: card.planId,
      cardNumber: card.cardNumber,
      issuedAt: card.issuedAt,
      organisation: { id: ctx.organisation.id, name: ctx.organisation.name, slug: ctx.organisation.slug },
      planName: card.plan.name,
      status: deriveStatus(card.member.terms.filter((term) => term.planId === card.planId), now).status,
      design,
      holder: holderFor(card, ctx, now),
      branding,
      verifyPath: verifyPath(card.verifyToken),
      downloads: { pdf: cardDownloadPath(card.id, "pdf"), pngFront: cardDownloadPath(card.id, "png"), pngBack: design.backEnabled ? cardDownloadPath(card.id, "png", "back") : null },
    });
  }
  return out;
}
