import { SHAPE_PATH_MAX } from "./layerTypes";

/*
 * Vector outlines shared by the canvas, the PNG and the PDF: absolute move, line, cubic curve and
 * close commands only, so every renderer draws exactly the same geometry (the PDF turns them into
 * path operators directly, the PNG and the browser into an SVG `d`).
 */

export type PathCmd = ["M", number, number] | ["L", number, number] | ["C", number, number, number, number, number, number] | ["Z"];

const n = (value: number) => Number(value.toFixed(3));

export function pathD(cmds: readonly PathCmd[]) {
  return cmds.map((cmd) => cmd[0] + cmd.slice(1).map((value) => n(value as number)).join(" ")).join("");
}

/** Move and scale an outline: every point (x, y) becomes (dx + x·sx, dy + y·sy). */
export function transformPath(cmds: readonly PathCmd[], dx: number, dy: number, sx: number, sy: number): PathCmd[] {
  return cmds.map((cmd) => {
    if (cmd[0] === "Z") return cmd;
    const values = cmd.slice(1) as number[];
    return [cmd[0], ...values.map((value, index) => (index % 2 === 0 ? dx + value * sx : dy + value * sy))] as PathCmd;
  });
}

/** A closed polygon through `points`. */
export function polygon(points: ReadonlyArray<readonly [number, number]>): PathCmd[] {
  if (points.length === 0) return [];
  return [["M", points[0]![0], points[0]![1]], ...points.slice(1).map(([x, y]) => ["L", x, y] as PathCmd), ["Z"]];
}

/** Four cubic arcs approximating an ellipse in the box (the same constant renderers use elsewhere). */
export function ellipseCmds(x: number, y: number, w: number, h: number): PathCmd[] {
  const k = 0.5522847498;
  const [rx, ry, cx, cy] = [w / 2, h / 2, x + w / 2, y + h / 2];
  return [
    ["M", cx + rx, cy],
    ["C", cx + rx, cy + ry * k, cx + rx * k, cy + ry, cx, cy + ry],
    ["C", cx - rx * k, cy + ry, cx - rx, cy + ry * k, cx - rx, cy],
    ["C", cx - rx, cy - ry * k, cx - rx * k, cy - ry, cx, cy - ry],
    ["C", cx + rx * k, cy - ry, cx + rx, cy - ry * k, cx + rx, cy],
    ["Z"],
  ];
}

/** A rectangle with corners rounded by `r` (clamped to half the shorter side). */
export function roundRectCmds(x: number, y: number, w: number, h: number, radius: number): PathCmd[] {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (r === 0) return polygon([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
  const k = r * (1 - 0.5522847498);
  return [
    ["M", x + r, y], ["L", x + w - r, y], ["C", x + w - k, y, x + w, y + k, x + w, y + r],
    ["L", x + w, y + h - r], ["C", x + w, y + h - k, x + w - k, y + h, x + w - r, y + h],
    ["L", x + r, y + h], ["C", x + k, y + h, x, y + h - k, x, y + h - r],
    ["L", x, y + r], ["C", x, y + k, x + k, y, x + r, y], ["Z"],
  ];
}

const TOKEN = /([MLCQZmlcqz])|(-?\d*\.?\d+(?:e-?\d+)?)/g;
const ARITY: Record<string, number> = { M: 2, L: 2, C: 6, Q: 4, Z: 0 };

/**
 * A custom shape's path in percent of its box: absolute M, L, C, Q and Z only, every coordinate
 * 0–100, at most SHAPE_PATH_MAX numbers. Returns the commands (quadratics raised to cubics), or null
 * when anything else appears.
 */
export function parseShapePath(value: string): PathCmd[] | null {
  if (typeof value !== "string" || value.length > SHAPE_PATH_MAX * 8) return null;
  if (/[^MLCQZ0-9.\-\se,]/.test(value)) return null;
  const tokens = [...value.matchAll(TOKEN)].map((match) => match[0]);
  const cmds: PathCmd[] = [];
  let numbers = 0;
  let index = 0;
  let [x, y] = [0, 0];
  while (index < tokens.length) {
    const op = tokens[index++]!;
    if (!(op in ARITY)) return null;
    const args: number[] = [];
    for (let i = 0; i < ARITY[op]!; i += 1) {
      const v = Number(tokens[index++]);
      if (!Number.isFinite(v) || v < 0 || v > 100) return null;
      args.push(Math.round(v * 10) / 10);
    }
    numbers += args.length;
    if (numbers > SHAPE_PATH_MAX) return null;
    if (op === "Z") cmds.push(["Z"]);
    else if (op === "Q") {
      const [qx, qy, ex, ey] = args as [number, number, number, number];
      cmds.push(["C", x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey]);
    } else cmds.push([op, ...args] as PathCmd);
    if (op !== "Z") [x, y] = [args.at(-2)!, args.at(-1)!];
  }
  if (cmds.length === 0 || cmds[0]![0] !== "M") return null;
  return cmds;
}

/** A custom path made safe to store: re-serialised from its parsed commands, or "" when invalid. */
export function normalizeShapePath(value: unknown) {
  const cmds = typeof value === "string" ? parseShapePath(value) : null;
  return cmds ? pathD(cmds) : "";
}
