import type { CardLayer } from "../layerTypes";
import { normalAngle, round1, selectionBounds, type Rect } from "./bounds";
import { mapSelected, moveLayers, scaleLayers } from "./groups";

/*
 * Exact position and size from the Position panel. One layer edits its own box (as stored: the box
 * before turning). Several layers or a group edit their joint bounds: moving shifts every member,
 * resizing stretches them all from the top left corner.
 */

export type BoxField = "x" | "y" | "w" | "h" | "rotation";
type Card = { widthMm: number; heightMm: number };

/** The box the panel shows: the layer's own for one layer, else the selection's bounds. */
export function selectionBox(layers: readonly CardLayer[], ids: readonly string[]): (Rect & { rotation: number | null }) | null {
  const picked = layers.filter((layer) => ids.includes(layer.id));
  if (picked.length === 1) {
    const [layer] = picked as [CardLayer];
    return { x: layer.xMm, y: layer.yMm, w: layer.wMm, h: layer.hMm, rotation: layer.rotationDeg };
  }
  const bounds = selectionBounds(layers, ids);
  return bounds ? { x: round1(bounds.x), y: round1(bounds.y), w: round1(bounds.w), h: round1(bounds.h), rotation: null } : null;
}

const minimumHeight = (layer: CardLayer) => (layer.kind === "line" ? 0.1 : 1);

export function editSelectionBox(layers: readonly CardLayer[], ids: readonly string[], field: BoxField, value: number, lockRatio: boolean): CardLayer[] {
  if (!Number.isFinite(value)) return [...layers];
  const picked = layers.filter((layer) => ids.includes(layer.id) && !layer.locked);
  if (picked.length === 1) {
    const [layer] = picked as [CardLayer];
    return mapSelected(layers, [layer.id], () => {
      const ratio = layer.wMm / layer.hMm;
      switch (field) {
        case "x": return { ...layer, xMm: round1(value) };
        case "y": return { ...layer, yMm: round1(value) };
        case "rotation": return { ...layer, rotationDeg: normalAngle(value) };
        case "w": {
          const wMm = round1(Math.max(1, value));
          return { ...layer, wMm, hMm: lockRatio ? round1(Math.max(minimumHeight(layer), wMm / ratio)) : layer.hMm };
        }
        case "h": {
          const hMm = round1(Math.max(minimumHeight(layer), value));
          return { ...layer, hMm, wMm: lockRatio ? round1(Math.max(1, hMm * ratio)) : layer.wMm };
        }
      }
    });
  }
  const bounds = selectionBounds(layers, picked.map((layer) => layer.id));
  if (!bounds) return [...layers];
  const movable = picked.map((layer) => layer.id);
  if (field === "x") return moveLayers(layers, movable, value - bounds.x, 0);
  if (field === "y") return moveLayers(layers, movable, 0, value - bounds.y);
  if (field === "rotation") return [...layers];
  const ratio = bounds.w / bounds.h;
  const w = field === "w" ? Math.max(1, value) : lockRatio ? Math.max(1, value * ratio) : bounds.w;
  const h = field === "h" ? Math.max(1, value) : lockRatio ? Math.max(1, value / ratio) : bounds.h;
  return scaleLayers(layers, movable, bounds, { x: bounds.x, y: bounds.y, w, h });
}

/** Centre the selection (as one piece) across the card (`x`) or down it (`y`). */
export function centreOnCard(layers: readonly CardLayer[], ids: readonly string[], axis: "x" | "y", card: Card): CardLayer[] {
  const bounds = selectionBounds(layers.filter((layer) => !layer.locked), ids);
  if (!bounds) return [...layers];
  return axis === "x" ? moveLayers(layers, ids, card.widthMm / 2 - (bounds.x + bounds.w / 2), 0) : moveLayers(layers, ids, 0, card.heightMm / 2 - (bounds.y + bounds.h / 2));
}

/** Stretch one layer, or the selection's bounds, to cover the whole card. */
export function fillCard(layers: readonly CardLayer[], ids: readonly string[], card: Card): CardLayer[] {
  const picked = layers.filter((layer) => ids.includes(layer.id) && !layer.locked);
  if (picked.length === 1) return mapSelected(layers, [picked[0]!.id], (layer) => ({ ...layer, xMm: 0, yMm: 0, wMm: card.widthMm, hMm: card.heightMm, rotationDeg: 0 }));
  const bounds = selectionBounds(picked, picked.map((layer) => layer.id));
  return bounds ? scaleLayers(layers, picked.map((layer) => layer.id), bounds, { x: 0, y: 0, w: card.widthMm, h: card.heightMm }) : [...layers];
}
