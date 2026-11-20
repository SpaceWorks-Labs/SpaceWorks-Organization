import { clamp, CARD_LINE_HEIGHT, PT_TO_MM, round1, TILE_PADDING_MM } from "./elements";

/*
 * The QR code's white tile: the code with a quiet zone of about two modules all round, and an optional
 * "Scan to verify" caption on the same tile under it, in Deep Ink on white so it reads on any card.
 * The tile keeps the box it always had (the code size plus 1 mm each side); the quiet zone comes out of
 * the code, and the caption adds to the tile's height. Shared by the canvas and the PDF/PNG renderer.
 */

export const QR_CAPTION = "Scan to verify";

/** White space between the tile edge and the code. */
export function qrQuietZoneMm(sizeMm: number) {
  return Math.max(TILE_PADDING_MM, round1(sizeMm * 0.08));
}

export function qrCaptionPt(sizeMm: number) {
  return clamp(round1(sizeMm * 0.3), 5, 8);
}

/**
 * Height the caption adds to the tile: its line starts half a quiet zone under the code and has a
 * little white under it.
 */
export function qrCaptionHeightMm(sizeMm: number) {
  const quiet = qrQuietZoneMm(sizeMm);
  return round1(qrCaptionPt(sizeMm) * PT_TO_MM * CARD_LINE_HEIGHT.label - quiet / 2 + quiet * 0.6);
}

/** The tile, the code inside it and the caption's line box, in millimetres from the tile's top left. */
export function qrTile(sizeMm: number, caption: boolean) {
  const side = sizeMm + 2 * TILE_PADDING_MM;
  const quiet = qrQuietZoneMm(sizeMm);
  const captionHeight = caption ? qrCaptionHeightMm(sizeMm) : 0;
  return {
    width: side,
    height: side + captionHeight,
    code: { offset: quiet, size: round1(side - 2 * quiet) },
    caption: caption ? { top: side - quiet / 2, sizePt: qrCaptionPt(sizeMm) } : null,
  };
}
