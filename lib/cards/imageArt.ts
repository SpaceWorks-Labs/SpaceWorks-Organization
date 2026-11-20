import type { CardImageAdjust, CardImageCrop } from "./design/layerTypes";

/*
 * What happens to a layer's picture before it is drawn: crop and zoom, a mask shape and colour
 * adjustments. The server bakes all of it into the bitmap with sharp (lib/cards/assets.ts), so the PNG
 * and the PDF embed the very same pixels; the canvas approximates it with CSS (object-position, scale,
 * clip-path and filters) from the same numbers.
 */

export type ImageArt = { mask: "none" | "circle" | "hexagon" | "rounded" | "square"; crop: CardImageCrop; adjust: CardImageAdjust };

export const isPlainArt = (art: ImageArt | undefined) =>
  !art || (art.mask === "none" && art.crop.zoom === 1 && art.crop.xPct === 50 && art.crop.yPct === 50 && !art.adjust.brightness && !art.adjust.contrast && !art.adjust.saturation && !art.adjust.blur);

/**
 * The part of a `srcW × srcH` picture that fills a box of aspect `boxAspect` (width / height): the
 * largest region of that shape, placed like CSS `object-position: x% y%`, then shrunk by `zoom`
 * about the same point (CSS `transform: scale(zoom)` with that transform origin).
 */
export function cropRegion(srcW: number, srcH: number, boxAspect: number, crop: CardImageCrop) {
  const baseW = Math.min(srcW, srcH * boxAspect);
  const baseH = baseW / boxAspect;
  const fx = crop.xPct / 100;
  const fy = crop.yPct / 100;
  const baseLeft = (srcW - baseW) * fx;
  const baseTop = (srcH - baseH) * fy;
  const w = baseW / crop.zoom;
  const h = baseH / crop.zoom;
  const left = baseLeft + (baseW - w) * fx;
  const top = baseTop + (baseH - h) * fy;
  const clampInt = (value: number, max: number) => Math.max(0, Math.min(max, Math.round(value)));
  const width = Math.max(1, Math.min(srcW, Math.round(w)));
  const height = Math.max(1, Math.min(srcH, Math.round(h)));
  return { left: clampInt(left, srcW - width), top: clampInt(top, srcH - height), width, height };
}

/** Linear factors for the adjustments: 1 is unchanged. */
export function adjustFactors(adjust: CardImageAdjust) {
  return { brightness: 1 + adjust.brightness / 100, contrast: 1 + adjust.contrast / 100, saturation: 1 + adjust.saturation / 100 };
}

/** Blur as a standard deviation in millimetres (`blur` is tenths of a millimetre). */
export const blurMm = (adjust: CardImageAdjust) => adjust.blur / 10;

/** The CSS filter the canvas uses for the same adjustments at `pxPerMm`. */
export function cssFilter(adjust: CardImageAdjust, grayscale: boolean, pxPerMm: number) {
  const f = adjustFactors(adjust);
  const parts = [
    f.brightness !== 1 ? `brightness(${f.brightness})` : "",
    f.contrast !== 1 ? `contrast(${f.contrast})` : "",
    f.saturation !== 1 ? `saturate(${f.saturation})` : "",
    adjust.blur ? `blur(${blurMm(adjust) * pxPerMm}px)` : "",
    grayscale ? "grayscale(1)" : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}
