import type { GradientGeometry } from "./design/paint";
import type { PathCmd } from "./design/path";

/*
 * The vector drawing ops the newer layer kinds need, on top of the rectangles, ellipses, text and
 * images in lib/cards/layout.ts. Coordinates are millimetres on the card (top-left origin). The PNG
 * draws them as SVG, the PDF as path operators and shadings, from the same numbers.
 */

/** A filled and/or stroked outline. Fills use the even-odd rule unless `nonzero`; `gradient` (card coordinates) replaces `fill`. */
export type VectorOp = {
  kind: "vector";
  cmds: PathCmd[];
  fill?: string;
  gradient?: GradientGeometry;
  nonzero?: boolean;
  stroke?: string;
  strokeWidth?: number;
  /** Dash and gap lengths in millimetres. */
  dash?: number[];
  round?: boolean;
  /** 0–1, multiplied by the layer's opacity. */
  opacity?: number;
};

/** Ops drawn only inside an outline (textures, gradients' shapes). */
export type ClipOp = { kind: "clip"; cmds: PathCmd[]; ops: Array<VectorOp> };

/** A stroked icon path from lib/cards/design/icons.ts: `d` in its own units, placed at (x, y) and scaled by `scale` mm per unit. */
export type IconOp = { kind: "icon"; d: string; x: number; y: number; scale: number; stroke: string; strokeWidth: number; opacity?: number };

/** An outline moved by (dx, dy), from box coordinates onto the card. */
export function translateCmds(cmds: readonly PathCmd[], dx: number, dy: number): PathCmd[] {
  return cmds.map((cmd) => (cmd[0] === "Z" ? cmd : ([cmd[0], ...(cmd.slice(1) as number[]).map((value, index) => value + (index % 2 === 0 ? dx : dy))] as PathCmd)));
}

/** Gradient geometry moved from box coordinates onto the card. */
export function translateGradient(geometry: GradientGeometry, dx: number, dy: number): GradientGeometry {
  return geometry.type === "linear"
    ? { ...geometry, x1: geometry.x1 + dx, y1: geometry.y1 + dy, x2: geometry.x2 + dx, y2: geometry.y2 + dy }
    : { ...geometry, cx: geometry.cx + dx, cy: geometry.cy + dy };
}
