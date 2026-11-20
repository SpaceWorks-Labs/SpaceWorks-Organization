import type { CardShadow, ShapePaint } from "../design/layerTypes";
import { gradientGeometry, patternCmds } from "../design/paint";
import type { PathCmd } from "../design/path";
import type { CardOp } from "../layout";
import { translateCmds, translateGradient } from "../vectorOps";

/*
 * Fill, gradient, texture, outline and shadow of a shape layer as vector ops, drawn in that order.
 * `outline` is relative to the box; everything is placed on the card here.
 */

type Colour = (hex: string) => string;
type Box = { x: number; y: number; w: number; h: number };

/** The outline offset by the shadow and filled with its colour. */
export function shadowOp(outline: PathCmd[], box: Box, shadow: CardShadow, colour: Colour): CardOp {
  return { kind: "vector", cmds: translateCmds(outline, box.x + shadow.dxMm, box.y + shadow.dyMm), fill: colour(shadow.color), opacity: shadow.opacityPct / 100 };
}

export function paintOps(paint: ShapePaint, outline: PathCmd[], box: Box, colour: Colour): CardOp[] {
  if (outline.length === 0) return [];
  const placed = translateCmds(outline, box.x, box.y);
  const ops: CardOp[] = [];
  if (paint.shadow) ops.push(shadowOp(outline, box, paint.shadow, colour));
  if (paint.gradient) {
    const geometry = gradientGeometry(paint.gradient, box.w, box.h);
    ops.push({ kind: "vector", cmds: placed, gradient: translateGradient({ ...geometry, stops: geometry.stops.map((stop) => ({ ...stop, color: colour(stop.color) })) }, box.x, box.y) });
  } else if (paint.fill) {
    ops.push({ kind: "vector", cmds: placed, fill: colour(paint.fill) });
  }
  if (paint.pattern) {
    ops.push({ kind: "clip", cmds: placed, ops: [{ kind: "vector", cmds: translateCmds(patternCmds(paint.pattern, box.w, box.h).cmds, box.x, box.y), fill: colour(paint.pattern.color), nonzero: true }] });
  }
  if (paint.stroke && paint.strokeMm > 0) ops.push({ kind: "vector", cmds: placed, stroke: colour(paint.stroke), strokeWidth: paint.strokeMm });
  return ops;
}

/** Whether a rectangle or ellipse uses only what the original shapes could (solid fill and outline). */
export const plainPaint = (paint: ShapePaint) => !paint.gradient && !paint.pattern && !paint.shadow;
