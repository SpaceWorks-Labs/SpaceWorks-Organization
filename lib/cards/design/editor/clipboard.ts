import { canFlip, LAYER_ID_PATTERN, MAX_LAYERS, type CardLayer } from "../layerTypes";
import { layerBounds, normalAngle, round1, unionRect } from "./bounds";
import { newGroupId } from "./groups";

/*
 * Copy, cut, paste, duplicate, delete and flip for a selection of layers. The clipboard lives in the
 * designer only (never the system clipboard) and works across sides. Pasted and duplicated layers get
 * new ids and new group ids, so copies never join the originals' groups. Nothing is added past
 * MAX_LAYERS: a paste that doesn't fit adds nothing.
 */

type Side = { widthMm: number; heightMm: number; layers: CardLayer[]; order: string[] };
export type LayerClipboard = { layers: CardLayer[]; pastes: number };
export const PASTE_OFFSET_MM = 3;

export function newLayerId(taken: Iterable<string>) {
  const used = new Set(taken);
  for (;;) {
    const id = `l${Math.random().toString(36).slice(2, 10).padEnd(8, "0")}`;
    if (!used.has(id) && LAYER_ID_PATTERN.test(id)) return id;
  }
}

/** The selected layers, bottom first as they stack, for the clipboard. */
export function copyLayers(side: Pick<Side, "layers" | "order">, ids: readonly string[]): LayerClipboard | null {
  const byId = new Map(side.layers.map((layer) => [layer.id, layer]));
  const picked = side.order.filter((key) => ids.includes(key) && byId.has(key)).map((key) => structuredClone(byId.get(key)!));
  return picked.length ? { layers: picked, pastes: 0 } : null;
}

/** Fresh ids and group ids for copies, moved by `offset` and kept on the card. */
function freshCopies(side: Side, originals: readonly CardLayer[], offset: number): CardLayer[] {
  const ids = new Set(side.layers.map((layer) => layer.id));
  const groups = new Map<string, string>();
  const taken = side.layers.map((layer) => layer.groupId);
  return originals.map((original) => {
    const id = newLayerId(ids);
    ids.add(id);
    let groupId: string | null = null;
    if (original.groupId) {
      groupId = groups.get(original.groupId) ?? newGroupId([...taken, ...groups.values()]);
      groups.set(original.groupId, groupId);
    }
    const xMm = Math.min(side.widthMm - 1, Math.max(-original.wMm + 1, round1(original.xMm + offset)));
    const yMm = Math.min(side.heightMm - 0.1, Math.max(-original.hMm + 0.1, round1(original.yMm + offset)));
    return { ...structuredClone(original), id, groupId, xMm, yMm, locked: false } as CardLayer;
  });
}

/** Add the clipboard's layers on top of `side`, each paste stepping a little further down and right. */
export function pasteLayers<T extends Side>(side: T, clipboard: LayerClipboard): { side: T; ids: string[]; clipboard: LayerClipboard } | null {
  if (clipboard.layers.length === 0 || side.layers.length + clipboard.layers.length > MAX_LAYERS) return null;
  const sameSide = clipboard.layers.some((layer) => side.layers.some((existing) => existing.id === layer.id));
  const offset = sameSide ? PASTE_OFFSET_MM * (clipboard.pastes + 1) : PASTE_OFFSET_MM * clipboard.pastes;
  const copies = freshCopies(side, clipboard.layers, offset);
  return {
    side: { ...side, layers: [...side.layers, ...copies], order: [...side.order, ...copies.map((layer) => layer.id)] },
    ids: copies.map((layer) => layer.id),
    clipboard: { ...clipboard, pastes: clipboard.pastes + 1 },
  };
}

/** Copies of the selection 3 mm down and right, just above the topmost selected layer. */
export function duplicateLayers<T extends Side>(side: T, ids: readonly string[]): { side: T; ids: string[] } | null {
  const clip = copyLayers(side, ids);
  if (!clip || side.layers.length + clip.layers.length > MAX_LAYERS) return null;
  const copies = freshCopies(side, clip.layers, PASTE_OFFSET_MM);
  const top = Math.max(...clip.layers.map((layer) => side.order.indexOf(layer.id)));
  const order = [...side.order];
  order.splice(top + 1, 0, ...copies.map((layer) => layer.id));
  return { side: { ...side, layers: [...side.layers, ...copies], order }, ids: copies.map((layer) => layer.id) };
}

export function deleteLayers<T extends Side>(side: T, ids: readonly string[]): T {
  const gone = new Set(ids.filter((id) => side.layers.some((layer) => layer.id === id && !layer.locked)));
  return { ...side, layers: side.layers.filter((layer) => !gone.has(layer.id)), order: side.order.filter((key) => !gone.has(key)) };
}

/**
 * Mirror the selection left–right (`x`) or top–bottom (`y`) as a whole: positions mirror about the
 * selection's centre and turns reverse; layers that may flip also mirror their artwork. Text and codes
 * keep reading the right way round. A single text layer, QR or barcode doesn't change.
 */
export function flipLayers(layers: readonly CardLayer[], ids: readonly string[], axis: "x" | "y"): CardLayer[] {
  const picked = layers.filter((layer) => ids.includes(layer.id) && !layer.locked);
  const bounds = unionRect(picked.map(layerBounds));
  if (!bounds || (picked.length === 1 && !canFlip(picked[0]!))) return [...layers];
  const centre = axis === "x" ? bounds.x + bounds.w / 2 : bounds.y + bounds.h / 2;
  const chosen = new Set(picked.map((layer) => layer.id));
  return layers.map((layer) => {
    if (!chosen.has(layer.id)) return layer;
    const next = { ...layer, rotationDeg: normalAngle(-layer.rotationDeg) };
    if (axis === "x") next.xMm = round1(2 * centre - (layer.xMm + layer.wMm / 2) - layer.wMm / 2);
    else next.yMm = round1(2 * centre - (layer.yMm + layer.hMm / 2) - layer.hMm / 2);
    if (canFlip(layer)) {
      if (axis === "x") next.flipX = !layer.flipX;
      else next.flipY = !layer.flipY;
    } else {
      next.rotationDeg = layer.rotationDeg;
    }
    return next;
  });
}

/** Whether a flip would do anything to the selection. */
export function canFlipSelection(layers: readonly CardLayer[], ids: readonly string[]) {
  const picked = layers.filter((layer) => ids.includes(layer.id) && !layer.locked);
  return picked.length > 1 || picked.some((layer) => canFlip(layer));
}
