import { GROUP_ID_PATTERN, type CardLayer } from "../layerTypes";
import { normalAngle, round1, type Rect } from "./bounds";

/*
 * Groups and moving several layers at once. Layers that share a `groupId` select, move, resize and
 * turn together; a selection always holds whole groups. Every function returns a new layer list.
 */

export function newGroupId(taken: Iterable<string | null> = []) {
  const used = new Set(taken);
  for (;;) {
    const id = `g${Math.random().toString(36).slice(2, 10).padEnd(8, "0")}`;
    if (!used.has(id) && GROUP_ID_PATTERN.test(id)) return id;
  }
}

/** The selection grown to whole groups, in stacking-independent layer order. */
export function expandToGroups(layers: readonly CardLayer[], ids: readonly string[]): string[] {
  const wanted = new Set(ids);
  const groups = new Set(layers.filter((layer) => wanted.has(layer.id) && layer.groupId).map((layer) => layer.groupId));
  return layers.filter((layer) => wanted.has(layer.id) || (layer.groupId && groups.has(layer.groupId))).map((layer) => layer.id);
}

/** Whether the selection is exactly one whole group. */
export function isOneGroup(layers: readonly CardLayer[], ids: readonly string[]) {
  const picked = layers.filter((layer) => ids.includes(layer.id));
  const group = picked[0]?.groupId;
  return Boolean(group) && picked.length > 1 && picked.every((layer) => layer.groupId === group) && layers.filter((layer) => layer.groupId === group).length === picked.length;
}

/** Put two or more layers in one new group (leaving any groups they were in). */
export function groupLayers(layers: readonly CardLayer[], ids: readonly string[], groupId = newGroupId(layers.map((layer) => layer.groupId))): CardLayer[] {
  if (ids.length < 2) return [...layers];
  const wanted = new Set(ids);
  return layers.map((layer) => (wanted.has(layer.id) ? { ...layer, groupId } : layer));
}

/** Break up every group a selected layer belongs to. */
export function ungroupLayers(layers: readonly CardLayer[], ids: readonly string[]): CardLayer[] {
  const groups = new Set(layers.filter((layer) => ids.includes(layer.id) && layer.groupId).map((layer) => layer.groupId));
  return layers.map((layer) => (layer.groupId && groups.has(layer.groupId) ? { ...layer, groupId: null } : layer));
}

/** Apply `edit` to each selected, unlocked layer. */
export function mapSelected(layers: readonly CardLayer[], ids: readonly string[], edit: (layer: CardLayer) => CardLayer): CardLayer[] {
  const wanted = new Set(ids);
  return layers.map((layer) => (wanted.has(layer.id) && !layer.locked ? edit(layer) : layer));
}

export function moveLayers(layers: readonly CardLayer[], ids: readonly string[], dxMm: number, dyMm: number): CardLayer[] {
  if (!dxMm && !dyMm) return [...layers];
  return mapSelected(layers, ids, (layer) => ({ ...layer, xMm: round1(layer.xMm + dxMm), yMm: round1(layer.yMm + dyMm) }));
}

/** How much a turned box's own width and height grow when the page is stretched by `sx`, `sy`. */
export function axisScales(rotationDeg: number, sx: number, sy: number) {
  const angle = (rotationDeg * Math.PI) / 180;
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  return { w: Math.hypot(sx * cos, sy * sin), h: Math.hypot(sx * sin, sy * cos) };
}

/**
 * Stretch the selected layers from the rectangle `from` to `to` (a group resize). Each centre keeps its
 * place in the rectangle; sizes follow the stretch along each layer's own axes, and text sizes follow
 * the smaller of the two stretches.
 */
export function scaleLayers(layers: readonly CardLayer[], ids: readonly string[], from: Rect, to: Rect): CardLayer[] {
  const sx = from.w > 0 ? to.w / from.w : 1;
  const sy = from.h > 0 ? to.h / from.h : 1;
  return mapSelected(layers, ids, (layer) => {
    const scale = axisScales(layer.rotationDeg, sx, sy);
    const w = Math.max(1, layer.wMm * scale.w);
    const h = Math.max(layer.kind === "line" ? 0.1 : 1, layer.kind === "line" ? layer.hMm : layer.hMm * scale.h);
    const cx = to.x + (layer.xMm + layer.wMm / 2 - from.x) * sx;
    const cy = to.y + (layer.yMm + layer.hMm / 2 - from.y) * sy;
    const next = { ...layer, wMm: round1(w), hMm: round1(h), xMm: round1(cx - w / 2), yMm: round1(cy - h / 2) } as CardLayer;
    if (next.kind === "text") next.sizePt = Math.min(96, Math.max(4, round1(next.sizePt * Math.min(sx, sy))));
    return next;
  });
}

/** Turn the selected layers by `deltaDeg` about `pivot` (a group turn): centres orbit, each box turns. */
export function rotateLayers(layers: readonly CardLayer[], ids: readonly string[], pivot: { x: number; y: number }, deltaDeg: number): CardLayer[] {
  if (!deltaDeg) return [...layers];
  const angle = (deltaDeg * Math.PI) / 180;
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  return mapSelected(layers, ids, (layer) => {
    const cx = layer.xMm + layer.wMm / 2 - pivot.x;
    const cy = layer.yMm + layer.hMm / 2 - pivot.y;
    const nx = pivot.x + cx * cos - cy * sin;
    const ny = pivot.y + cx * sin + cy * cos;
    return { ...layer, xMm: round1(nx - layer.wMm / 2), yMm: round1(ny - layer.hMm / 2), rotationDeg: normalAngle(layer.rotationDeg + deltaDeg) };
  });
}

/** The angle from `centre` to `point`, 0 pointing up, clockwise, in degrees. */
export function angleTo(centre: { x: number; y: number }, point: { x: number; y: number }) {
  return (Math.atan2(point.x - centre.x, centre.y - point.y) * 180) / Math.PI;
}

/** A group turn from where the drag started to where the pointer is; `snap` rounds to 15°. */
export function turnDelta(centre: { x: number; y: number }, start: { x: number; y: number }, now: { x: number; y: number }, snap: boolean) {
  const delta = normalAngle(angleTo(centre, now) - angleTo(centre, start));
  return snap ? Math.round(delta / 15) * 15 : Math.round(delta);
}
