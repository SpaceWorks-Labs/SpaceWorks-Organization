import "server-only";

import { prisma } from "@/lib/db";
import { cardState, verifyPath } from "./core";
import { CARD_INCLUDE, cardRoleId, designFor, holderFor, loadCardOrgContext } from "./data";
import type { CardDesign } from "./design/presets";
import type { CardBranding, CardHolder } from "./types";
import { cardDownloadPath } from "./wallet";

/*
 * The cards section of a member's page: for every plan the member has held, the live card (drawn
 * with its plan's design) and the cards it replaced or that were revoked.
 */

export type MemberCardSummary = {
  cardId: string;
  cardNumber: string;
  issuedAt: Date;
  lastEmailedAt: Date | null;
  design: CardDesign;
  holder: CardHolder;
  branding: CardBranding;
  verifyPath: string;
  downloads: { pdf: string; pngFront: string; pngBack: string | null };
};

export type MemberCardPlan = {
  planId: string;
  planName: string;
  /** A membership on this plan has started, so a card can be issued. */
  started: boolean;
  live: MemberCardSummary | null;
  history: Array<{ cardId: string; cardNumber: string; issuedAt: Date; revokedAt: Date; state: "replaced" | "revoked" }>;
};

export async function loadMemberCardPanel(organisationId: string, memberId: string, plans: Array<{ planId: string; planName: string; started: boolean }>): Promise<MemberCardPlan[]> {
  const [cards, ctx] = await Promise.all([
    prisma.memberCard.findMany({ where: { organisationId, memberId }, include: CARD_INCLUDE, orderBy: { issuedAt: "desc" } }),
    loadCardOrgContext(organisationId),
  ]);
  if (!ctx) return [];
  return plans.map((plan) => {
    const forPlan = cards.filter((card) => card.planId === plan.planId);
    const live = forPlan.find((card) => !card.revokedAt);
    const input = live ? designFor(ctx, live.plan, cardRoleId(live)) : null;
    return {
      ...plan,
      live: live && input ? {
        cardId: live.id,
        cardNumber: live.cardNumber,
        issuedAt: live.issuedAt,
        lastEmailedAt: live.lastEmailedAt,
        design: input.design,
        holder: holderFor(live, ctx),
        branding: input.branding,
        verifyPath: verifyPath(live.verifyToken),
        downloads: { pdf: cardDownloadPath(live.id, "pdf"), pngFront: cardDownloadPath(live.id, "png"), pngBack: input.design.backEnabled ? cardDownloadPath(live.id, "png", "back") : null },
      } : null,
      history: forPlan.flatMap((card) => (card.revokedAt ? [{ cardId: card.id, cardNumber: card.cardNumber, issuedAt: card.issuedAt, revokedAt: card.revokedAt, state: cardState(card) as "replaced" | "revoked" }] : [])),
    };
  });
}
