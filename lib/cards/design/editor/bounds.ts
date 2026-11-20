import type { CardLayer } from "../layerTypes";

/*
 * Boxes the designer measures with: a layer's box turned about its centre, the upright rectangle
 * that encloses it, and the rectangle around several. All in millimetres, from the card's top left.
 */

export type Rect = { x: number; y: number; w: number; h: number };
export type BoxLike = Pick<CardLayer, "xMm" | "yMm" | "wMm" | "hMm" | "rotationDeg">;

export const round1 = (value: number) => Math.round(value * 10) / 10 || 0;
export const round2 = (value: number) => Math.round(value * 100) / 100 || 0;

/** The upright rectangle a turned box covers. */
export function layerBounds(box: BoxLike): Rect {
  const angle = (box.rotationDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const w = box.wMm * cos + box.hMm * sin;
  const h = box.wMm * sin + box.hMm * cos;
  const cx = box.xMm + box.wMm / 2;
  const cy = box.yMm + box.hMm / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export function unionRect(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.w));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

export function intersects(a: Rect, b: Rect) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** A rectangle from two corners in any order (a marquee drag). */
export function rectFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

/** Angles stay within (-180, 180]. */
export function normalAngle(degrees: number) {
  const turned = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return turned === -180 ? 180 : round1(turned);
}

/** The bounds of the given layers together (null when none of them exist). */
export function selectionBounds(layers: readonly CardLayer[], ids: readonly string[]): Rect | null {
  const wanted = new Set(ids);
  return unionRect(layers.filter((layer) => wanted.has(layer.id)).map(layerBounds));
}
