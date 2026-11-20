/*
 * Print-ready card pages: the page is the card plus a bleed on every side, the card is drawn inset by the
 * bleed, its background runs to the page edge, and crop marks in the bleed show where to cut. Pure, shared by
 * lib/cards/renderPdf.ts and tests.
 */

/** Bleeds printers ask for, in mm; 0 is a plain card-size page. */
export const MIN_BLEED_MM = 2;
export const MAX_BLEED_MM = 5;
/** The designer's print-ready download. */
export const PRINT_BLEED_MM = 2;
/** Crop marks stop this far short of the card edge, so none shows on a slightly off cut. */
const MARK_GAP_MM = 0.5;

/** 0, or a bleed between 2 and 5 mm (clamped); anything else (absent, negative, not a number) is 0. */
export function normalizeBleedMm(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(MAX_BLEED_MM, Math.max(MIN_BLEED_MM, value));
}

type Line = { x1: number; y1: number; x2: number; y2: number };

/**
 * The page for one card side with `bleedMm` around it (mm, top-left origin): its size, where the card's top-left
 * corner sits, and eight crop marks (two per corner) running from the page edge towards the card's cut lines.
 */
export function bleedPage(widthMm: number, heightMm: number, bleedMm: number) {
  const bleed = normalizeBleedMm(bleedMm);
  const pageWidthMm = widthMm + 2 * bleed;
  const pageHeightMm = heightMm + 2 * bleed;
  const marks: Line[] = [];
  const length = bleed - MARK_GAP_MM;
  if (bleed > 0 && length > 0) {
    const left = bleed;
    const right = bleed + widthMm;
    const top = bleed;
    const bottom = bleed + heightMm;
    for (const x of [left, right]) {
      marks.push({ x1: x, y1: 0, x2: x, y2: length });
      marks.push({ x1: x, y1: pageHeightMm - length, x2: x, y2: pageHeightMm });
    }
    for (const y of [top, bottom]) {
      marks.push({ x1: 0, y1: y, x2: length, y2: y });
      marks.push({ x1: pageWidthMm - length, y1: y, x2: pageWidthMm, y2: y });
    }
  }
  return { pageWidthMm, pageHeightMm, originXMm: bleed, originYMm: bleed, bleedMm: bleed, marks };
}
