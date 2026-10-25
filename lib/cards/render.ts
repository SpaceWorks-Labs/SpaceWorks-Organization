import "server-only";

import { designFonts, type CardSide, type CardDesign } from "./design/presets";
import { loadCardFonts } from "./fonts";
import { buildCardScene, type CardScene } from "./layout";
import { renderCardsPdf, type CardPdfLayout } from "./renderPdf";
import { renderCardPng } from "./renderPng";
import type { CardBranding, CardHolder } from "./types";
import { createZip } from "./zip";

/*
 * Member cards through the render pipeline: the front and (when enabled) the back are two scenes, so
 * a single card is a two-page PDF and a batch keeps front/back pairs together for duplex printing.
 */

/** One bulk export holds at most this many cards; ZIPs are built in memory, so they stay smaller. */
export const BULK_PDF_LIMIT = 1000;
export const BULK_ZIP_LIMIT = 300;

export type CardInput = { design: CardDesign; branding: CardBranding };

export async function memberCardScenes(input: CardInput, holder: CardHolder): Promise<CardScene[]> {
  const { measurer } = await loadCardFonts(designFonts(input.design));
  const front = buildCardScene({ settings: input.design.front, holder, branding: input.branding, measurer });
  if (!input.design.backEnabled) return [front];
  return [front, buildCardScene({ settings: input.design.back, holder, branding: input.branding, measurer })];
}

/** A two-page PDF (front, back) or a 300 dpi PNG of either side. */
export async function renderMemberCard(input: CardInput, holder: CardHolder, format: "pdf" | "png", options: { side?: CardSide; title: string }) {
  const scenes = await memberCardScenes(input, holder);
  if (format === "png") return renderCardPng(options.side === "back" && scenes[1] ? scenes[1] : scenes[0]!);
  return renderCardsPdf(scenes, { layout: "card", title: options.title });
}

/** Every card in one PDF (card-size pages or A4 sheets), front then back for each member. */
export async function renderMemberCardsPdf(cards: AsyncIterable<{ input: CardInput; holder: CardHolder }>, layout: CardPdfLayout, title: string) {
  async function* scenes() {
    for await (const card of cards) yield* await memberCardScenes(card.input, card.holder);
  }
  return renderCardsPdf(scenes(), { layout, title });
}

/** A ZIP with one PDF per member, named by the caller (e.g. `SWO-0042-priya-raman.pdf`). */
export async function renderMemberCardsZip(cards: AsyncIterable<{ input: CardInput; holder: CardHolder }>, fileName: (holder: CardHolder) => string) {
  const entries: Array<{ name: string; data: Uint8Array }> = [];
  for await (const card of cards) {
    const pdf = await renderCardsPdf(await memberCardScenes(card.input, card.holder), { layout: "card", title: `${card.holder.displayName} membership card` });
    entries.push({ name: fileName(card.holder), data: pdf });
  }
  return createZip(entries);
}
