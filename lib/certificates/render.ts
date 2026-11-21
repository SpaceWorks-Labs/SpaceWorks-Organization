import "server-only";

import { certificateFonts, type CertificateSide } from "./design";
import { loadCardFonts } from "@/lib/cards/fonts";
import { buildCardScene, type CardScene } from "@/lib/cards/layout";
import { renderCardsPdf } from "@/lib/cards/renderPdf";
import { renderCardPng } from "@/lib/cards/renderPng";
import type { CardBranding, CardHolder } from "@/lib/cards/types";
import type { ZipEntry } from "@/lib/cards/zip";
import { withCertificateText, type CertificateTextValues } from "./placeholders";

/*
 * Certificates through the card render pipeline at page size: the design is one card side, so the PDF and the
 * PNG are drawn from the same scene (shaped glyph outlines, never a PDF font) and match pixel for pixel. A
 * certificate is one page, A4 or Letter, landscape or portrait; the PNG is 300 dpi.
 */

export type CertificateInput = { side: CertificateSide; branding: CardBranding; values: CertificateTextValues; holder: CardHolder };

async function certificateScene(input: CertificateInput): Promise<CardScene> {
  const { measurer } = await loadCardFonts(certificateFonts(input.side));
  return buildCardScene({ settings: withCertificateText(input.side, input.values), holder: input.holder, branding: input.branding, measurer });
}

/** One certificate as a one-page PDF, or a 300 dpi PNG. */
export async function renderCertificate(input: CertificateInput, format: "pdf" | "png", title: string) {
  const scene = await certificateScene(input);
  return format === "png" ? renderCardPng(scene) : renderCardsPdf([[scene]], { layout: "card", title });
}

/** Every certificate in one PDF, a page each (pages take their own design's size). */
export async function renderCertificatesPdf(items: AsyncIterable<CertificateInput>, title: string) {
  async function* scenes() {
    for await (const item of items) yield [await certificateScene(item)];
  }
  return renderCardsPdf(scenes(), { layout: "card", title });
}

/** One PDF per certificate as ZIP entries named by the caller. */
export async function* certificatePdfEntries(items: AsyncIterable<{ input: CertificateInput; name: string; title: string }>): AsyncGenerator<ZipEntry> {
  for await (const item of items) yield { name: item.name, data: await renderCertificate(item.input, "pdf", item.title) };
}
