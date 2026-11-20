import type { CardLayer } from "../layerTypes";
import { round1 } from "./bounds";
import { axisScales } from "./groups";

/*
 * Turning the card between landscape and portrait re-lays every layer in proportion. Built-in items
 * reflow through layoutForPaper; layers keep their place relative to the card: centres scale with
 * the card, layers touching an edge stay on it, bands that span the card keep spanning it, and
 * everything else keeps its shape at the smaller of the two scales (pictures, icons, codes and
 * photos never stretch). Text sizes follow the smaller scale.
 */

type Size = { widthMm: number; heightMm: number };
const EDGE_MM = 0.5;
const SPAN_SHARE = 0.9;
const KEEP_SHAPE = new Set(["image", "icon", "qr", "barcode", "photo"]);

function place(start: number, size: number, nextSize: number, from: number, to: number, scale: number) {
  if (start <= EDGE_MM) return start;
  if (start + size >= from - EDGE_MM) return to - nextSize - (from - start - size);
  return (start + size / 2) * scale - nextSize / 2;
}

export function relayoutLayers(layers: readonly CardLayer[], from: Size, to: Size): CardLayer[] {
  const sx = to.widthMm / from.widthMm;
  const sy = to.heightMm / from.heightMm;
  const s = Math.min(sx, sy);
  if (sx === 1 && sy === 1) return [...layers];
  return layers.map((layer) => {
    let w: number;
    let h: number;
    if (layer.kind === "text") {
      // A text box keeps its share of the card's width; its height follows the text size.
      [w, h] = [layer.wMm * sx, layer.hMm * s];
    } else if (layer.kind === "line") {
      [w, h] = [layer.wMm * axisScales(layer.rotationDeg, sx, sy).w, layer.hMm];
    } else if (KEEP_SHAPE.has(layer.kind) || layer.rotationDeg % 90 !== 0) {
      [w, h] = [layer.wMm * s, layer.hMm * s];
    } else {
      // Upright shapes: a band across the card keeps spanning it; anything smaller keeps its shape.
      const across = Math.abs(layer.rotationDeg) % 180 === 90;
      const spansW = (across ? layer.hMm : layer.wMm) >= from.widthMm * SPAN_SHARE;
      const spansH = (across ? layer.wMm : layer.hMm) >= from.heightMm * SPAN_SHARE;
      const [own, other] = across ? [spansH ? sy : s, spansW ? sx : s] : [spansW ? sx : s, spansH ? sy : s];
      [w, h] = [layer.wMm * own, layer.hMm * other];
    }
    w = Math.max(1, w);
    h = Math.max(layer.kind === "line" ? 0.1 : 1, h);
    const x = place(layer.xMm, layer.wMm, w, from.widthMm, to.widthMm, sx);
    const y = place(layer.yMm, layer.hMm, h, from.heightMm, to.heightMm, sy);
    const next = { ...layer, xMm: round1(x), yMm: round1(y), wMm: round1(w), hMm: round1(h) } as CardLayer;
    if (next.kind === "text") next.sizePt = Math.min(96, Math.max(4, round1(next.sizePt * s)));
    return next;
  });
}
