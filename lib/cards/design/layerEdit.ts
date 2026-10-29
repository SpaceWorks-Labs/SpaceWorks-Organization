import { DEFAULT_CARD_FONT } from "@/lib/cards/fontCatalog";
import { clamp, round1, type CardSideSettings } from "./elements";
import { MAX_LAYERS, type CardLayer, type CardLayerKind } from "./layers";

/*
 * Pure edits the designer makes to a side's layers and stacking order, plus the geometry of moving,
 * resizing and turning a layer with the mouse. Everything here returns new objects.
 */

type Side = Pick<CardSideSettings, "widthMm" | "heightMm" | "layers" | "order">;

function newLayerId(taken: Iterable<string>) {
  const used = new Set(taken);
  for (;;) {
    const id = `l${Math.random().toString(36).slice(2, 10).padEnd(8, "0")}`;
    if (!used.has(id)) return id;
  }
}

/** A new layer of `kind`, centred on the side, on top of everything. Null when the side is full. */
export function createLayer(side: Side, kind: CardLayerKind, extra: { url?: string; aspect?: number } = {}): CardLayer | null {
  if (side.layers.length >= MAX_LAYERS) return null;
  const id = newLayerId(side.layers.map((layer) => layer.id));
  const short = Math.min(side.widthMm, side.heightMm);
  const box = (wMm: number, hMm: number) => ({ wMm: round1(wMm), hMm: round1(hMm), xMm: round1((side.widthMm - wMm) / 2), yMm: round1((side.heightMm - hMm) / 2) });
  const base = { id, name: "", rotationDeg: 0, opacityPct: 100, hidden: false, locked: false };
  if (kind === "text") return { ...base, kind, ...box(side.widthMm * 0.6, 8), text: "Your text", font: DEFAULT_CARD_FONT, sizePt: 12, bold: false, uppercase: false, align: "center", color: "#142C2A", trackingEm: 0, lineHeight: 1.2 };
  if (kind === "image") {
    // Keep the picture's shape: 40% of the short side across its longer edge.
    const aspect = extra.aspect && extra.aspect > 0 ? extra.aspect : 1;
    const longest = short * 0.6;
    return { ...base, kind, ...box(aspect >= 1 ? longest : longest * aspect, aspect >= 1 ? longest / aspect : longest), url: extra.url ?? "", fit: "cover", radiusMm: 0, grayscale: false };
  }
  if (kind === "line") return { ...base, kind, ...box(side.widthMm * 0.5, 0.5), color: "#142C2A" };
  return { ...base, kind, ...box(short * 0.4, short * 0.4), fill: "#006E63", stroke: null, strokeMm: 0.5, radiusMm: kind === "rect" ? 2 : 0 };
}

export function addLayer<T extends Side>(side: T, layer: CardLayer): T {
  return { ...side, layers: [...side.layers, layer], order: [...side.order, layer.id] };
}

export function updateLayer<T extends Side>(side: T, id: string, patch: Partial<CardLayer>): T {
  return { ...side, layers: side.layers.map((layer) => (layer.id === id ? ({ ...layer, ...patch } as CardLayer) : layer)) };
}

export function removeLayer<T extends Side>(side: T, id: string): T {
  return { ...side, layers: side.layers.filter((layer) => layer.id !== id), order: side.order.filter((key) => key !== id) };
}

/** A copy 3 mm down and right, just above the original. */
export function duplicateLayer<T extends Side>(side: T, id: string): { side: T; id: string | null } {
  const original = side.layers.find((layer) => layer.id === id);
  if (!original || side.layers.length >= MAX_LAYERS) return { side, id: null };
  const copy = { ...original, id: newLayerId(side.layers.map((layer) => layer.id)), xMm: round1(original.xMm + 3), yMm: round1(original.yMm + 3), locked: false } as CardLayer;
  const order = [...side.order];
  order.splice(order.indexOf(id) + 1, 0, copy.id);
  return { side: { ...side, layers: [...side.layers, copy], order }, id: copy.id };
}

export type OrderMove = "forward" | "backward" | "front" | "back";

/** Move a built-in item or layer one step or all the way up (forward) or down the stack. */
export function moveInOrder<T extends Side>(side: T, key: string, move: OrderMove): T {
  const from = side.order.indexOf(key);
  if (from < 0) return side;
  const order = side.order.filter((item) => item !== key);
  const to = move === "front" ? order.length : move === "back" ? 0 : clamp(from + (move === "forward" ? 1 : -1), 0, order.length);
  order.splice(to, 0, key);
  return { ...side, order };
}

export type Box = { xMm: number; yMm: number; wMm: number; hMm: number; rotationDeg: number };
/** Which edges a resize handle moves: -1 the left/top edge, 1 the right/bottom edge, 0 neither. */
export type Handle = { x: -1 | 0 | 1; y: -1 | 0 | 1 };

/**
 * Resize a turned box by dragging one handle `dxMm, dyMm` (page space). The opposite edge stays put,
 * as it does on screen. `keepAspect` scales both sides together from a corner.
 */
export function resizeBox(box: Box, handle: Handle, dxMm: number, dyMm: number, keepAspect: boolean, minimum = { w: 1, h: 0.1 }): Box {
  const angle = (box.rotationDeg * Math.PI) / 180;
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  // The drag in the box's own (unturned) axes.
  const local = { x: dxMm * cos + dyMm * sin, y: -dxMm * sin + dyMm * cos };
  let w = Math.max(minimum.w, box.wMm + handle.x * local.x);
  let h = Math.max(minimum.h, box.hMm + handle.y * local.y);
  if (keepAspect && handle.x && handle.y) {
    const scale = Math.max(w / box.wMm, h / box.hMm);
    [w, h] = [Math.max(minimum.w, box.wMm * scale), Math.max(minimum.h, box.hMm * scale)];
  }
  // The centre moves by half the growth, along the box's axes, towards the dragged edges.
  const grow = { x: (handle.x * (w - box.wMm)) / 2, y: (handle.y * (h - box.hMm)) / 2 };
  const cx = box.xMm + box.wMm / 2 + grow.x * cos - grow.y * sin;
  const cy = box.yMm + box.hMm / 2 + grow.x * sin + grow.y * cos;
  return { ...box, wMm: round1(w), hMm: round1(h), xMm: round1(cx - w / 2), yMm: round1(cy - h / 2) };
}

/** The angle that points the box's top at the pointer, in whole degrees; Shift snaps to 15°. */
export function rotationTowards(box: Box, pointer: { xMm: number; yMm: number }, snap: boolean) {
  const cx = box.xMm + box.wMm / 2;
  const cy = box.yMm + box.hMm / 2;
  const degrees = (Math.atan2(pointer.xMm - cx, cy - pointer.yMm) * 180) / Math.PI;
  const step = snap ? 15 : 1;
  const rounded = Math.round(degrees / step) * step;
  return rounded > 180 ? rounded - 360 : rounded <= -180 ? rounded + 360 : rounded;
}
