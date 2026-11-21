import { CARD_PREFIX_PATTERN, deriveCardPrefix } from "@/lib/cards/core";
import { DEFAULT_WATERMARK, type CardSideSettings } from "@/lib/cards/design/elements";
import { normalizeCardSide } from "@/lib/cards/design/normalize";
import { scopeCardArtwork } from "@/lib/cards/design/layers";
import { record } from "@/lib/cards/design/layerValues";
import { DEFAULT_NUMBER_FORMAT, normalizeNumberFormat, numberFormatError } from "@/lib/cards/numbering";
import { pageDimensions, type CertificatePage } from "./pages";
import { starterLayers } from "./starter";

/*
 * A certificate design is one card side in the card layer model (lib/cards/design/*) at page size. Only the
 * layers, the background image and the page colours are the designer's: every built-in card item (name, photo,
 * QR tile, heading, footer, watermark) is switched off, so what prints is exactly what the layers say. Saved
 * and submitted designs are never trusted; they are normalised on every read.
 */

export type CertificateSide = CardSideSettings;

/** The built-in card items, all off. */
const NO_BUILT_INS = {
  template: "minimal",
  heading: "", cardLabel: "", footerText: "", printFieldKeys: [] as string[], printFieldLabels: {} as Record<string, string>,
  showLogo: false, showSymbol: false, showPhoto: false, showName: false, showQr: false, showQrCaption: false,
  showRole: false, showPlan: false, showIdNumber: false, showValidUntil: false, showFooter: false, showCardLabel: false,
  nameAutoFit: false,
} as const;

/** Make one stored or submitted design safe, at the page's size, with no built-in card items. */
export function normalizeCertificateSide(value: unknown, context: { organisationName: string }, page: CertificatePage): CertificateSide {
  const size = pageDimensions(page.pageSize, page.orientation);
  const side = normalizeCardSide({ ...(record(value) ?? {}), ...size }, { organisationName: context.organisationName, planName: "" });
  return { ...side, ...NO_BUILT_INS, ...size, watermark: { ...DEFAULT_WATERMARK } };
}

/** A new design: white page, the starter layers. */
export function defaultCertificateSide(context: { organisationName: string }, page: CertificatePage): CertificateSide {
  const size = pageDimensions(page.pageSize, page.orientation);
  return normalizeCertificateSide({ ...size, backgroundColor: "white", layers: starterLayers(size.widthMm, size.heightMm), gridSizeMm: 5 }, context, page);
}

/** Only this organisation's own artwork draws (the same `member-id-artwork` uploads cards use). */
export function withOwnCertificateArtwork(side: CertificateSide, organisationId: string): CertificateSide {
  return scopeCardArtwork(side, organisationId);
}

/** The font ids a design's text layers use, to load before drawing. */
export function certificateFonts(side: CertificateSide) {
  return side.layers.flatMap((layer) => (layer.kind === "text" ? [layer.font] : []));
}

export const CERTIFICATE_PREFIX_PATTERN = CARD_PREFIX_PATTERN;
export const DEFAULT_CERTIFICATE_NUMBER_FORMAT = DEFAULT_NUMBER_FORMAT;
export const normalizeCertificateNumberFormat = normalizeNumberFormat;

/** A short number prefix from a design's name: its initials, or the first letters of a one-word name. */
export const certificatePrefix = deriveCardPrefix;

/** Why a pattern can't number certificates, or null. The wording is the card rules', said for certificates. */
export function certificateNumberFormatError(format: string) {
  return numberFormatError(format)?.replace(/\bcard number/g, "certificate number").replace(/\bCard number/g, "Certificate number") ?? null;
}
