import type { CardLayer, CardPathShapeLayer } from "./layerTypes";
import { ellipseCmds, parseShapePath, polygon, roundRectCmds, transformPath, type PathCmd } from "./path";

/*
 * The outline of every filled layer, in millimetres relative to the layer box's top-left corner.
 * The canvas, the PNG and the PDF all fill these same commands with the even-odd rule (a frame is an
 * outer and an inner outline), so shapes match exactly. Bands are drawn as headers (a straight top
 * edge, the decorative edge at the bottom); a footer is the same band flipped top to bottom.
 */

type Pt = readonly [number, number];
const K = 0.5522847498;

function regular(sides: number, w: number, h: number, start: number): Pt[] {
  return Array.from({ length: sides }, (_, i) => {
    const a = start + (i * 2 * Math.PI) / sides;
    return [w / 2 + (w / 2) * Math.cos(a), h / 2 + (h / 2) * Math.sin(a)] as const;
  });
}

function star(points: number, inner: number, w: number, h: number): Pt[] {
  return Array.from({ length: points * 2 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const r = i % 2 === 0 ? 1 : inner;
    return [w / 2 + (w / 2) * r * Math.cos(a), h / 2 + (h / 2) * r * Math.sin(a)] as const;
  });
}

/** A band's lower edge as a gentle double wave between `top` and `h`, sampled finely enough to print smooth. */
function waveEdge(w: number, h: number, depth: number): Pt[] {
  const amplitude = (h * depth) / 2;
  const steps = 48;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const x = w - (i * w) / steps;
    return [x, h - amplitude + amplitude * Math.cos((x / w) * 4 * Math.PI)] as const;
  });
}

function heart(w: number, h: number): PathCmd[] {
  const p = (x: number, y: number) => [x * w, y * h] as const;
  return [
    ["M", ...p(0.5, 0.28)],
    ["C", ...p(0.5, 0.12), ...p(0.36, 0), ...p(0.24, 0)],
    ["C", ...p(0.1, 0), ...p(0, 0.12), ...p(0, 0.3)],
    ["C", ...p(0, 0.55), ...p(0.25, 0.75), ...p(0.5, 1)],
    ["C", ...p(0.75, 0.75), ...p(1, 0.55), ...p(1, 0.3)],
    ["C", ...p(1, 0.12), ...p(0.9, 0), ...p(0.76, 0)],
    ["C", ...p(0.64, 0), ...p(0.5, 0.12), ...p(0.5, 0.28)],
    ["Z"],
  ];
}

function shield(w: number, h: number): PathCmd[] {
  return [
    ["M", w / 2, 0], ["L", w, h * 0.14], ["L", w, h * 0.45],
    ["C", w, h * 0.72, w * 0.75, h * 0.9, w / 2, h],
    ["C", w * 0.25, h * 0.9, 0, h * 0.72, 0, h * 0.45],
    ["L", 0, h * 0.14], ["Z"],
  ];
}

function speech(w: number, h: number, radius: number): PathCmd[] {
  const body = h * 0.78;
  const r = Math.max(0, Math.min(radius || Math.min(w, body) * 0.18, w / 2, body / 2));
  const k = r * (1 - K);
  return [
    ["M", r, 0], ["L", w - r, 0], ["C", w - k, 0, w, k, w, r],
    ["L", w, body - r], ["C", w, body - k, w - k, body, w - r, body],
    ["L", w * 0.36, body], ["L", w * 0.18, h], ["L", w * 0.22, body],
    ["L", r, body], ["C", k, body, 0, body - k, 0, body - r],
    ["L", 0, r], ["C", 0, k, k, 0, r, 0], ["Z"],
  ];
}

export function shapeCmds(layer: Pick<CardPathShapeLayer, "shape" | "points" | "depthPct" | "radiusMm" | "path">, w: number, h: number): PathCmd[] {
  const d = layer.depthPct / 100;
  switch (layer.shape) {
    case "triangle": return polygon([[w / 2, 0], [w, h], [0, h]]);
    case "rightTriangle": return polygon([[0, 0], [w, h], [0, h]]);
    case "diamond": return polygon([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]);
    case "pentagon": return polygon(regular(5, w, h, -Math.PI / 2));
    case "hexagon": return polygon(regular(6, w, h, 0));
    case "octagon": return polygon(regular(8, w, h, Math.PI / 8));
    case "star":
    case "burst": return polygon(star(layer.points, d, w, h));
    case "heart": return heart(w, h);
    case "arrow": {
      const head = Math.min(w * 0.45, h);
      const shaft = (h * d) / 2;
      return polygon([[0, h / 2 - shaft], [w - head, h / 2 - shaft], [w - head, 0], [w, h / 2], [w - head, h], [w - head, h / 2 + shaft], [0, h / 2 + shaft]]);
    }
    case "chevron": {
      const t = Math.min(w, h) * d * 0.6;
      return polygon([[0, 0], [w - t, 0], [w, h / 2], [w - t, h], [0, h], [t, h / 2]]);
    }
    case "shield": return shield(w, h);
    case "badge": return polygon([[0, 0], [w, 0], [w, h], [w / 2, h * (1 - d * 0.5)], [0, h]]);
    case "speech": return speech(w, h, layer.radiusMm);
    case "cross": {
      const tw = (w * d) / 2;
      const th = (h * d) / 2;
      const [cx, cy] = [w / 2, h / 2];
      return polygon([[cx - tw, 0], [cx + tw, 0], [cx + tw, cy - th], [w, cy - th], [w, cy + th], [cx + tw, cy + th], [cx + tw, h], [cx - tw, h], [cx - tw, cy + th], [0, cy + th], [0, cy - th], [cx - tw, cy - th]]);
    }
    case "waveBand": return polygon([[0, 0], [w, 0], ...waveEdge(w, h, d)]);
    case "curveBand": return [["M", 0, 0], ["L", w, 0], ["L", w, h * (1 - d)], ["C", w * 0.62, h * (1 - d), w * 0.38, h, 0, h], ["Z"]];
    case "chevronBand": return polygon([[0, 0], [w, 0], [w, h * (1 - d)], [w / 2, h], [0, h * (1 - d)]]);
    case "diagonalBand": return polygon([[0, 0], [w, 0], [w, h * (1 - d)], [0, h]]);
    case "ribbon": {
      const notch = Math.min(h / 2, w * 0.2) * d * 2;
      return polygon([[0, 0], [w, 0], [w - notch, h / 2], [w, h], [0, h], [notch, h / 2]]);
    }
    case "corner": return polygon([[0, 0], [w, 0], [0, h]]);
    case "cornerRound": return [["M", 0, 0], ["L", w, 0], ["C", w, h * K, w * K, h, 0, h], ["Z"]];
    case "frame": {
      const t = Math.max(0.2, (Math.min(w, h) / 2) * d * 0.5);
      return [...roundRectCmds(0, 0, w, h, layer.radiusMm), ...roundRectCmds(t, t, w - 2 * t, h - 2 * t, Math.max(0, layer.radiusMm - t))];
    }
    case "path": return transformPath(parseShapePath(layer.path) ?? [], 0, 0, w / 100, h / 100);
  }
}

/** The outline of a filled layer (rectangle, ellipse or shape) relative to its box, or null for other kinds. */
export function layerOutline(layer: CardLayer, w = layer.wMm, h = layer.hMm): PathCmd[] | null {
  if (layer.kind === "rect") return roundRectCmds(0, 0, w, h, layer.radiusMm);
  if (layer.kind === "ellipse") return ellipseCmds(0, 0, w, h);
  if (layer.kind === "shape") return shapeCmds(layer, w, h);
  return null;
}

/** A photo or picture mask outline in a box (hexagon: flat top and bottom). */
export function maskCmds(mask: "circle" | "rounded" | "hexagon" | "square" | "none", w: number, h: number, radiusMm = 0): PathCmd[] {
  if (mask === "circle") return ellipseCmds(0, 0, w, h);
  if (mask === "hexagon") return polygon(regular(6, w, h, 0));
  if (mask === "rounded") return roundRectCmds(0, 0, w, h, Math.min(w, h) * 0.2);
  return roundRectCmds(0, 0, w, h, radiusMm);
}
