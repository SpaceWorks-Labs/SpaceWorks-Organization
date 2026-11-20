import type { Rect } from "./bounds";

/*
 * Smart guides: while a box (or a selection's bounds) is dragged or resized, its edges and centre snap
 * to the card's edges and centre lines, the safe zone, custom guides, and other items' edges and
 * centres, when they come within a few screen pixels. The result says how far to shift and which
 * guide lines to draw. Spacing hints measure the gaps to the nearest neighbours.
 */

export type Axis = "x" | "y";
export type SnapKind = "card" | "centre" | "safe" | "guide" | "item" | "spacing";
/** A line a box can snap to: `at` across the axis, optionally only spanning `from`–`to` along it. */
export type SnapTarget = { axis: Axis; at: number; kind: SnapKind; from?: number; to?: number };
/** A guide line to draw: vertical lines (`axis: "x"`) at x = `at` from y = `from` to `to`. */
export type GuideLine = { axis: Axis; at: number; from: number; to: number; kind: SnapKind };
/** Which of a box's lines may snap on each axis: its start (left/top), middle or end (right/bottom). */
export type SnapEdges = { x: readonly Anchor[]; y: readonly Anchor[] };
export type Anchor = "start" | "middle" | "end";

export const ALL_EDGES: SnapEdges = { x: ["start", "middle", "end"], y: ["start", "middle", "end"] };
/** Snapping reaches this many screen pixels, whatever the zoom. */
export const SNAP_PX = 6;

export function snapThresholdMm(pxPerMm: number) {
  return SNAP_PX / Math.max(0.1, pxPerMm);
}

/** Every line on the card a box can snap to. `others` are the boxes of items not being moved. */
export function snapTargets(card: { widthMm: number; heightMm: number; safeMm: number; guides?: { x: readonly number[]; y: readonly number[] } }, others: readonly Rect[] = []): SnapTarget[] {
  const { widthMm: w, heightMm: h, safeMm: safe } = card;
  const targets: SnapTarget[] = [
    { axis: "x", at: 0, kind: "card" }, { axis: "x", at: w, kind: "card" }, { axis: "x", at: w / 2, kind: "centre" },
    { axis: "y", at: 0, kind: "card" }, { axis: "y", at: h, kind: "card" }, { axis: "y", at: h / 2, kind: "centre" },
  ];
  if (safe > 0) targets.push({ axis: "x", at: safe, kind: "safe" }, { axis: "x", at: w - safe, kind: "safe" }, { axis: "y", at: safe, kind: "safe" }, { axis: "y", at: h - safe, kind: "safe" });
  for (const x of card.guides?.x ?? []) targets.push({ axis: "x", at: x, kind: "guide" });
  for (const y of card.guides?.y ?? []) targets.push({ axis: "y", at: y, kind: "guide" });
  for (const rect of others) {
    for (const x of [rect.x, rect.x + rect.w / 2, rect.x + rect.w]) targets.push({ axis: "x", at: x, kind: "item", from: rect.y, to: rect.y + rect.h });
    for (const y of [rect.y, rect.y + rect.h / 2, rect.y + rect.h]) targets.push({ axis: "y", at: y, kind: "item", from: rect.x, to: rect.x + rect.w });
  }
  return targets;
}

const anchorsOf = (rect: Rect, axis: Axis): Record<Anchor, number> => (axis === "x"
  ? { start: rect.x, middle: rect.x + rect.w / 2, end: rect.x + rect.w }
  : { start: rect.y, middle: rect.y + rect.h / 2, end: rect.y + rect.h });

/**
 * Positions where the box would sit at equal distance between its nearest neighbours on either side
 * (only neighbours that overlap it across the axis count). These become extra snap targets.
 */
export function equalSpacingTargets(rect: Rect, others: readonly Rect[]): SnapTarget[] {
  const targets: SnapTarget[] = [];
  for (const axis of ["x", "y"] as const) {
    const before = nearest(rect, others, axis, -1);
    const after = nearest(rect, others, axis, 1);
    if (!before || !after) continue;
    const [beforeEnd, afterStart, size] = axis === "x" ? [before.x + before.w, after.x, rect.w] : [before.y + before.h, after.y, rect.h];
    if (afterStart - beforeEnd < size) continue;
    targets.push({ axis, at: (beforeEnd + afterStart) / 2, kind: "spacing" });
  }
  return targets;
}

/**
 * How far to shift `rect` so its nearest allowed line lands on a target, per axis, plus the guide
 * lines to draw at the snapped position. Spacing targets only snap the box's middle.
 */
export function snapRect(rect: Rect, targets: readonly SnapTarget[], thresholdMm: number, edges: SnapEdges = ALL_EDGES): { dx: number; dy: number; guides: GuideLine[] } {
  const shift = { x: 0, y: 0 };
  for (const axis of ["x", "y"] as const) {
    const anchors = anchorsOf(rect, axis);
    let best: number | null = null;
    for (const target of targets) {
      if (target.axis !== axis) continue;
      for (const anchor of edges[axis]) {
        if (target.kind === "spacing" && anchor !== "middle") continue;
        const delta = target.at - anchors[anchor];
        if (Math.abs(delta) <= thresholdMm && (best === null || Math.abs(delta) < Math.abs(best))) best = delta;
      }
    }
    if (best !== null) shift[axis] = best;
  }
  const snapped = { ...rect, x: rect.x + shift.x, y: rect.y + shift.y };
  return { dx: shift.x, dy: shift.y, guides: guidesFor(snapped, targets, edges) };
}

/** The guide lines a box touches exactly, each long enough to join the box and what it lines up with. */
export function guidesFor(rect: Rect, targets: readonly SnapTarget[], edges: SnapEdges = ALL_EDGES): GuideLine[] {
  const lines = new Map<string, GuideLine>();
  for (const target of targets) {
    if (target.kind === "spacing") continue;
    const anchors = anchorsOf(rect, target.axis);
    const span = target.axis === "x" ? [rect.y, rect.y + rect.h] : [rect.x, rect.x + rect.w];
    for (const anchor of edges[target.axis]) {
      if (Math.abs(anchors[anchor] - target.at) > 0.01) continue;
      const from = target.from === undefined ? Number.NEGATIVE_INFINITY : Math.min(span[0]!, target.from);
      const to = target.to === undefined ? Number.POSITIVE_INFINITY : Math.max(span[1]!, target.to!);
      const key = `${target.axis}:${Math.round(target.at * 100)}`;
      const known = lines.get(key);
      lines.set(key, known ? { ...known, from: Math.min(known.from, from), to: Math.max(known.to, to), kind: known.kind === "item" ? target.kind : known.kind } : { axis: target.axis, at: target.at, from, to, kind: target.kind });
    }
  }
  return [...lines.values()];
}

/** The nearest box wholly on one side of `rect` (`direction` -1 before, 1 after) that overlaps it across the axis. */
function nearest(rect: Rect, others: readonly Rect[], axis: Axis, direction: -1 | 1): Rect | null {
  let found: Rect | null = null;
  let gap = Number.POSITIVE_INFINITY;
  for (const other of others) {
    const overlaps = axis === "x" ? other.y < rect.y + rect.h && rect.y < other.y + other.h : other.x < rect.x + rect.w && rect.x < other.x + other.w;
    if (!overlaps) continue;
    const distance = axis === "x"
      ? direction < 0 ? rect.x - (other.x + other.w) : other.x - (rect.x + rect.w)
      : direction < 0 ? rect.y - (other.y + other.h) : other.y - (rect.y + rect.h);
    if (distance >= -0.01 && distance < gap) {
      gap = distance;
      found = other;
    }
  }
  return found;
}

/** A measured gap between the box and a neighbour, drawn across the gap at `cross`. */
export type SpacingHint = { axis: Axis; from: number; to: number; cross: number; gapMm: number; equal: boolean };

/**
 * Gaps from the box to its nearest neighbour on each side (and to the card's edges when there is
 * none), with `equal` set when the gaps on both sides of an axis match.
 */
export function spacingHints(rect: Rect, others: readonly Rect[], card?: { widthMm: number; heightMm: number }): SpacingHint[] {
  const hints: SpacingHint[] = [];
  for (const axis of ["x", "y"] as const) {
    const [start, end] = axis === "x" ? [rect.x, rect.x + rect.w] : [rect.y, rect.y + rect.h];
    const before = nearest(rect, others, axis, -1);
    const after = nearest(rect, others, axis, 1);
    const cardEnd = axis === "x" ? card?.widthMm : card?.heightMm;
    const beforeAt = before ? (axis === "x" ? before.x + before.w : before.y + before.h) : card ? 0 : null;
    const afterAt = after ? (axis === "x" ? after.x : after.y) : cardEnd ?? null;
    const crossOf = (other: Rect | null) => {
      if (axis === "x") {
        const top = Math.max(rect.y, other?.y ?? rect.y);
        const bottom = Math.min(rect.y + rect.h, other ? other.y + other.h : rect.y + rect.h);
        return (top + bottom) / 2;
      }
      const left = Math.max(rect.x, other?.x ?? rect.x);
      const right = Math.min(rect.x + rect.w, other ? other.x + other.w : rect.x + rect.w);
      return (left + right) / 2;
    };
    const gaps: SpacingHint[] = [];
    if (beforeAt !== null && start - beforeAt > 0.05) gaps.push({ axis, from: beforeAt, to: start, cross: crossOf(before), gapMm: Math.round((start - beforeAt) * 10) / 10, equal: false });
    if (afterAt !== null && afterAt - end > 0.05) gaps.push({ axis, from: end, to: afterAt, cross: crossOf(after), gapMm: Math.round((afterAt - end) * 10) / 10, equal: false });
    if (gaps.length === 2 && Math.abs(gaps[0]!.gapMm - gaps[1]!.gapMm) <= 0.1) for (const gap of gaps) gap.equal = true;
    hints.push(...gaps);
  }
  return hints;
}
