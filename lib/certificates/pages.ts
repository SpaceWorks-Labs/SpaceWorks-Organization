/*
 * Certificate pages: A4 or US Letter, landscape or portrait, in millimetres. Pure and client-safe, so the
 * designer, the loaders and the renderers agree on the size.
 */

export const PAGE_SIZES = ["A4", "LETTER"] as const;
export type CertificatePageSize = (typeof PAGE_SIZES)[number];
export const ORIENTATIONS = ["LANDSCAPE", "PORTRAIT"] as const;
export type CertificateOrientation = (typeof ORIENTATIONS)[number];

export const PAGE_SIZE_LABELS: Record<CertificatePageSize, string> = { A4: "A4 (210 × 297 mm)", LETTER: "US Letter (8.5 × 11 in)" };
export const ORIENTATION_LABELS: Record<CertificateOrientation, string> = { LANDSCAPE: "Landscape", PORTRAIT: "Portrait" };

const PORTRAIT_MM: Record<CertificatePageSize, { widthMm: number; heightMm: number }> = {
  A4: { widthMm: 210, heightMm: 297 },
  LETTER: { widthMm: 215.9, heightMm: 279.4 },
};

export const isPageSize = (value: unknown): value is CertificatePageSize => (PAGE_SIZES as readonly unknown[]).includes(value);
export const isOrientation = (value: unknown): value is CertificateOrientation => (ORIENTATIONS as readonly unknown[]).includes(value);

/** The page in millimetres: landscape swaps the portrait sides. */
export function pageDimensions(pageSize: CertificatePageSize, orientation: CertificateOrientation) {
  const { widthMm, heightMm } = PORTRAIT_MM[pageSize];
  return orientation === "PORTRAIT" ? { widthMm, heightMm } : { widthMm: heightMm, heightMm: widthMm };
}

export type CertificatePage = { pageSize: CertificatePageSize; orientation: CertificateOrientation };
export const DEFAULT_PAGE: CertificatePage = { pageSize: "A4", orientation: "LANDSCAPE" };

/** A stored page, with anything unexpected replaced by the default. */
export function readPage(value: { pageSize?: unknown; orientation?: unknown } | null | undefined): CertificatePage {
  return {
    pageSize: isPageSize(value?.pageSize) ? value.pageSize : DEFAULT_PAGE.pageSize,
    orientation: isOrientation(value?.orientation) ? value.orientation : DEFAULT_PAGE.orientation,
  };
}

/** How long a title, a type label, a design name and a revoke reason may be. */
export const TITLE_MAX = 120;
export const TYPE_LABEL_MAX = 80;
export const NAME_MAX = 80;
export const REASON_MAX = 600;
export const REVOKE_REASON_MAX = 300;
