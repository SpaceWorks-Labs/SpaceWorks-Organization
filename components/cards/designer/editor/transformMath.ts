import { layerBounds, type Rect } from "@/lib/cards/design/editor/bounds";
import { rotateLayers, scaleLayers, turnDelta } from "@/lib/cards/design/editor/groups";
import { guidesFor, snapRect, type GuideLine, type SnapEdges, type SnapTarget } from "@/lib/cards/design/editor/snapping";
import { resizeBox, rotationTowards, type Box, type Handle } from "@/lib/cards/design/layerEdit";
import type { CardLayer } from "@/lib/cards/design/layerTypes";

/*
 * What a resize or turn of the selection does at one pointer position: pure, so the canvas hook only
 * deals with pointers. One layer resizes and turns its own (possibly turned) box; several layers
 * resize and turn their joint bounds.
 */

export type TransformMode = "move" | "rotate" | Handle;
/** Kinds that keep their shape from a corner unless Shift is held. */
const KEEP_RATIO = new Set(["image", "photo", "qr", "icon"]);

export const boxOf = (layer: CardLayer): Box => ({ xMm: layer.xMm, yMm: layer.yMm, wMm: layer.wMm, hMm: layer.hMm, rotationDeg: layer.rotationDeg });
const rectOfBox = (box: Box): Rect => ({ x: box.xMm, y: box.yMm, w: box.wMm, h: box.hMm });

/** The edges a handle moves, for snapping only those. */
export function handleEdges(handle: Handle): SnapEdges {
  const pick = (side: -1 | 0 | 1) => (side === 1 ? (["end"] as const) : side === -1 ? (["start"] as const) : ([] as const));
  return { x: pick(handle.x), y: pick(handle.y) };
}

type Resize = { layers: CardLayer[]; guides: GuideLine[] };

/**
 * Resize from `handle` by a drag of `dx, dy` mm. With `snap`, the moving edges of an upright box
 * snap to `targets` within `threshold`.
 */
export function resizeSelection(start: CardLayer[], ids: string[], bounds: Rect, handle: Handle, dx: number, dy: number, shift: boolean, snap: { targets: SnapTarget[]; threshold: number } | null): Resize {
  const single = ids.length === 1 ? start.find((layer) => layer.id === ids[0]) : undefined;
  const corner = handle.x !== 0 && handle.y !== 0;
  const box = single ? boxOf(single) : { xMm: bounds.x, yMm: bounds.y, wMm: bounds.w, hMm: bounds.h, rotationDeg: 0 };
  // Pictures and groups keep their shape from a corner unless Shift is held; everything else only with Shift.
  const keepAspect = corner && (!single || KEEP_RATIO.has(single.kind) ? !shift : shift);
  const minimum = { w: 1, h: single?.kind === "line" ? 0.1 : 1 };
  let next = resizeBox(box, handle, dx, dy, keepAspect, minimum);
  let guides: GuideLine[] = [];
  if (snap && box.rotationDeg % 360 === 0) {
    const edges = handleEdges(handle);
    const shiftBy = snapRect(rectOfBox(next), snap.targets, snap.threshold, edges);
    if (shiftBy.dx || shiftBy.dy) next = resizeBox(box, handle, dx + shiftBy.dx, dy + shiftBy.dy, keepAspect, minimum);
    guides = guidesFor(rectOfBox(next), snap.targets, edges);
  }
  if (single) {
    const { xMm, yMm, wMm, hMm } = next;
    return { layers: start.map((layer) => (layer.id === single.id ? ({ ...layer, xMm, yMm, wMm, hMm } as CardLayer) : layer)), guides };
  }
  return { layers: scaleLayers(start, ids, bounds, rectOfBox(next)), guides };
}

/** Turn towards the pointer: one layer points its top at it; several turn by the angle swept since the press. */
export function rotateSelection(start: CardLayer[], ids: string[], bounds: Rect, pressMm: { x: number; y: number }, pointerMm: { x: number; y: number }, shift: boolean): CardLayer[] {
  const single = ids.length === 1 ? start.find((layer) => layer.id === ids[0]) : undefined;
  if (single) {
    const rotationDeg = rotationTowards(boxOf(single), { xMm: pointerMm.x, yMm: pointerMm.y }, shift);
    return start.map((layer) => (layer.id === single.id ? { ...layer, rotationDeg } : layer));
  }
  const centre = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
  return rotateLayers(start, ids, centre, turnDelta(centre, pressMm, pointerMm, shift));
}

/** The boxes of visible layers outside the selection, for snapping to. */
export function otherRects(layers: readonly CardLayer[], ids: readonly string[]): Rect[] {
  return layers.filter((layer) => !layer.hidden && !ids.includes(layer.id)).map(layerBounds);
}
