import type { CardLayer } from "../layerTypes";
import { layerBounds, unionRect, type Rect } from "./bounds";
import { moveLayers } from "./groups";

/*
 * Align and distribute, measured on each item's turned bounds. A group counts as one item. With one
 * item selected it lines up with the card; with several, with the selection's own bounds. Locked
 * layers never move.
 */

export const ALIGN_EDGES = ["left", "centre", "right", "top", "middle", "bottom"] as const;
export type AlignEdge = (typeof ALIGN_EDGES)[number];
type Unit = { ids: string[]; rect: Rect };

/** The selection as movable units: one per group, one per loose layer. */
export function selectionUnits(layers: readonly CardLayer[], ids: readonly string[]): Unit[] {
  const wanted = new Set(ids);
  const units = new Map<string, CardLayer[]>();
  for (const layer of layers) {
    if (!wanted.has(layer.id) || layer.locked) continue;
    const key = layer.groupId ?? layer.id;
    units.set(key, [...(units.get(key) ?? []), layer]);
  }
  return [...units.values()].map((members) => ({ ids: members.map((layer) => layer.id), rect: unionRect(members.map(layerBounds))! }));
}

function offsetFor(rect: Rect, reference: Rect, edge: AlignEdge): [number, number] {
  switch (edge) {
    case "left": return [reference.x - rect.x, 0];
    case "centre": return [reference.x + reference.w / 2 - (rect.x + rect.w / 2), 0];
    case "right": return [reference.x + reference.w - (rect.x + rect.w), 0];
    case "top": return [0, reference.y - rect.y];
    case "middle": return [0, reference.y + reference.h / 2 - (rect.y + rect.h / 2)];
    case "bottom": return [0, reference.y + reference.h - (rect.y + rect.h)];
  }
}

export function alignLayers(layers: readonly CardLayer[], ids: readonly string[], edge: AlignEdge, card: { widthMm: number; heightMm: number }): CardLayer[] {
  const units = selectionUnits(layers, ids);
  if (units.length === 0) return [...layers];
  const reference = units.length === 1 ? { x: 0, y: 0, w: card.widthMm, h: card.heightMm } : unionRect(units.map((unit) => unit.rect))!;
  return units.reduce<CardLayer[]>((result, unit) => {
    const [dx, dy] = offsetFor(unit.rect, reference, edge);
    return moveLayers(result, unit.ids, dx, dy);
  }, [...layers]);
}

/** Space three or more items so the gaps between them are equal; the outermost two stay put. */
export function distributeLayers(layers: readonly CardLayer[], ids: readonly string[], axis: "x" | "y"): CardLayer[] {
  const units = selectionUnits(layers, ids);
  if (units.length < 3) return [...layers];
  const start = (rect: Rect) => (axis === "x" ? rect.x : rect.y);
  const size = (rect: Rect) => (axis === "x" ? rect.w : rect.h);
  const sorted = [...units].sort((a, b) => start(a.rect) + size(a.rect) / 2 - (start(b.rect) + size(b.rect) / 2));
  const first = sorted[0]!.rect;
  const last = sorted.at(-1)!.rect;
  const span = start(last) + size(last) - start(first);
  const gap = (span - sorted.reduce((total, unit) => total + size(unit.rect), 0)) / (sorted.length - 1);
  let cursor = start(first);
  return sorted.reduce<CardLayer[]>((result, unit) => {
    const delta = cursor - start(unit.rect);
    cursor += size(unit.rect) + gap;
    return axis === "x" ? moveLayers(result, unit.ids, delta, 0) : moveLayers(result, unit.ids, 0, delta);
  }, [...layers]);
}
