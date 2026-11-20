import type { CardGradient, CardPattern, GradientStop } from "./layerTypes";
import { ellipseCmds, polygon, type PathCmd } from "./path";

/*
 * Gradient and texture geometry, shared by the canvas, the PNG and the PDF so fills land in the same
 * place everywhere. Coordinates are millimetres relative to the box being filled.
 */

export type GradientGeometry =
  | { type: "linear"; x1: number; y1: number; x2: number; y2: number; stops: GradientStop[] }
  | { type: "radial"; cx: number; cy: number; r: number; stops: GradientStop[] };

/**
 * Linear: through the box centre along `angleDeg` (0 runs left to right, 90 top to bottom), long
 * enough that the end colours reach the far corners, as CSS does. Radial: from the centre out to the
 * corners.
 */
export function gradientGeometry(gradient: CardGradient, w: number, h: number): GradientGeometry {
  const [cx, cy] = [w / 2, h / 2];
  if (gradient.type === "radial") return { type: "radial", cx, cy, r: Math.hypot(w, h) / 2, stops: gradient.stops };
  const angle = (gradient.angleDeg * Math.PI) / 180;
  const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  return { type: "linear", x1: cx - dx * half, y1: cy - dy * half, x2: cx + dx * half, y2: cy + dy * half, stops: gradient.stops };
}

/** Stops spanning 0–100 with no two at the same place, so every renderer interpolates the same way. */
export function fullStops(stops: readonly GradientStop[]): GradientStop[] {
  const sorted = [...stops].sort((a, b) => a.atPct - b.atPct);
  if (sorted.length === 0) return [];
  if (sorted[0]!.atPct > 0) sorted.unshift({ atPct: 0, color: sorted[0]!.color });
  if (sorted.at(-1)!.atPct < 100) sorted.push({ atPct: 100, color: sorted.at(-1)!.color });
  return sorted.map((stop, index) => ({ ...stop, atPct: Math.min(100, stop.atPct + index * 0.001) }));
}

/** At most this many marks in one texture, whatever the box size, so files stay small. */
const MAX_MARKS = 3000;

type PatternShape = { cmds: PathCmd[] };

/**
 * A texture's marks over a `w × h` box, turned by its angle about the centre and clipped by the
 * caller to the shape. Every mark is a filled outline wound the same way (fill non-zero), so dots,
 * stripes, grid lines and waves overlap cleanly.
 */
export function patternCmds(pattern: CardPattern, w: number, h: number): PatternShape {
  const reach = Math.hypot(w, h) / 2;
  const step = Math.max(pattern.scaleMm, Math.sqrt((4 * reach * reach) / MAX_MARKS));
  const count = Math.ceil(reach / step);
  const angle = (pattern.angleDeg * Math.PI) / 180;
  const [cos, sin, cx, cy] = [Math.cos(angle), Math.sin(angle), w / 2, h / 2];
  const turn = (x: number, y: number) => [cx + x * cos - y * sin, cy + x * sin + y * cos] as const;
  const quad = (x0: number, y0: number, x1: number, y1: number) => polygon([turn(x0, y0), turn(x1, y0), turn(x1, y1), turn(x0, y1)]);
  const cmds: PathCmd[] = [];
  if (pattern.kind === "dots") {
    const r = step * 0.18;
    for (let i = -count; i <= count; i += 1) {
      for (let j = -count; j <= count; j += 1) {
        const [x, y] = turn(i * step + (j % 2 ? step / 2 : 0), j * step);
        if (x < -r || y < -r || x > w + r || y > h + r) continue;
        cmds.push(...ellipseCmds(x - r, y - r, 2 * r, 2 * r));
      }
    }
  } else if (pattern.kind === "stripes") {
    for (let i = -count; i <= count; i += 1) cmds.push(...quad(i * step - step / 4, -reach, i * step + step / 4, reach));
  } else if (pattern.kind === "grid") {
    const t = Math.max(0.15, step * 0.08) / 2;
    for (let i = -count; i <= count; i += 1) {
      cmds.push(...quad(i * step - t, -reach, i * step + t, reach));
      cmds.push(...quad(-reach, i * step - t, reach, i * step + t));
    }
  } else {
    const t = Math.max(0.2, step * 0.12) / 2;
    const amplitude = step * 0.25;
    const samples = Math.max(8, Math.ceil((2 * reach) / (step / 6)));
    for (let i = -count; i <= count; i += 1) {
      const top: Array<readonly [number, number]> = [];
      const bottom: Array<readonly [number, number]> = [];
      for (let s = 0; s <= samples; s += 1) {
        const x = -reach + (s * 2 * reach) / samples;
        const y = i * step + amplitude * Math.sin((x / step) * 2 * Math.PI);
        top.push(turn(x, y - t));
        bottom.unshift(turn(x, y + t));
      }
      cmds.push(...polygon([...top, ...bottom]));
    }
  }
  return { cmds };
}
