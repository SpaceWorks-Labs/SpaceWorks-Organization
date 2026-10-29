import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { safeFileName, slugForFile } from "@/lib/downloads";
import { CARD_INCLUDE, cardRoleId, designFor, holderFor, loadCardUnits, type CardOrgContext } from "./data";
import type { CardExportFormat } from "./exportFilter";
import { BULK_PDF_LIMIT, BULK_ZIP_LIMIT, memberCardPdfEntries, renderMemberCardsPdf, type CardInput } from "./render";
import type { CardHolder } from "./types";
import { zipStream } from "./zip";

/*
 * Bulk card downloads, drawn in the request from the live designs and never stored
 * (app/api/exports/cards/[orgSlug]/route.ts). Callers hold the render slot (lib/cards/renderSlot.ts) and
 * hand its release to these builders, which call it once the file is done, fails or the download stops.
 */

const PAGE = 100;

export function cardExportLimit(format: CardExportFormat) {
  return format === "zip" ? BULK_ZIP_LIMIT : BULK_PDF_LIMIT;
}

/** The cards matching `where`, page by page, each with its design (shared by plan and role) and holder. */
async function* cardsMatching(ctx: CardOrgContext, where: Prisma.MemberCardWhereInput) {
  const designs = new Map<string, CardInput>();
  let cursor: string | undefined;
  for (;;) {
    const cards = await prisma.memberCard.findMany({ where, include: CARD_INCLUDE, orderBy: { id: "asc" }, take: PAGE, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}) });
    await loadCardUnits(ctx, cards);
    for (const card of cards) {
      const key = `${card.planId}:${cardRoleId(card) ?? ""}`;
      let input = designs.get(key);
      if (!input) {
        const { design, branding } = designFor(ctx, card.plan, cardRoleId(card));
        input = { design, branding };
        designs.set(key, input);
      }
      yield { input, holder: holderFor(card, ctx) };
    }
    if (cards.length < PAGE) return;
    cursor = cards.at(-1)!.id;
  }
}

/** A ZIP entry name: card number, plan and member, e.g. `SWO-0042-annual-priya-raman.pdf`. */
export function cardFileName(holder: CardHolder) {
  return `${safeFileName(holder.idNumber ?? "card")}-${slugForFile(holder.planName ?? "", "plan")}-${slugForFile(holder.displayName, "member")}.pdf`;
}

/** A ZIP of one PDF per card, written as each card is drawn. */
export function cardsZipStream(ctx: CardOrgContext, where: Prisma.MemberCardWhereInput, release: () => void) {
  return zipStream(memberCardPdfEntries(cardsMatching(ctx, where), cardFileName), release);
}

/**
 * Every card in one PDF (A4 sheets or one card per page). The PDF can only be written once it is complete,
 * so the response starts at once and the body follows when the render is done.
 */
export function cardsPdfStream(ctx: CardOrgContext, where: Prisma.MemberCardWhereInput, layout: "a4" | "card", release: () => void) {
  let sent = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (sent) return;
      sent = true;
      try {
        controller.enqueue(await renderMemberCardsPdf(cardsMatching(ctx, where), layout, `${ctx.organisation.name} membership cards`));
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        release();
      }
    },
    // A render already under way keeps the slot until it ends, so two never run at once.
    cancel: () => {
      if (!sent) release();
    },
  });
}
