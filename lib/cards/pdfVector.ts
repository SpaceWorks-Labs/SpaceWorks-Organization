import "server-only";

import {
  appendBezierCurve,
  clipEvenOdd,
  closePath,
  endPath,
  fill,
  LineCapStyle,
  LineJoinStyle,
  lineTo,
  moveTo,
  PDFDict,
  PDFName,
  PDFOperator,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setDashPattern,
  setFillingColor,
  setGraphicsState,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingColor,
  stroke,
  type Color,
  type PDFOperatorNames,
  type PDFPage,
  type PDFRef,
} from "pdf-lib";
import { fullStops, type GradientGeometry } from "./design/paint";
import type { PathCmd } from "./design/path";
import { opacityState, type GlyphContext } from "./pdfGlyphs";
import { PT_PER_MM } from "./sheet";
import type { ClipOp, IconOp, VectorOp } from "./vectorOps";

/*
 * The vector ops (lib/cards/vectorOps.ts) as PDF path operators, from the same commands the PNG draws
 * as SVG: even-odd fills, round-joined strokes, clipping for textures, and axial or radial shadings
 * for gradients. `at` maps card millimetres to page points.
 */

export type PagePoint = { x: (mm: number) => number; y: (mm: number) => number };

export function hexColor(value: string): Color {
  const v = Number.parseInt(value.slice(1), 16);
  return rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
}

const rgbArray = (hex: string) => {
  const v = Number.parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};

function pathOps(cmds: readonly PathCmd[], at: PagePoint): PDFOperator[] {
  return cmds.map((cmd) => {
    if (cmd[0] === "M") return moveTo(at.x(cmd[1]), at.y(cmd[2]));
    if (cmd[0] === "L") return lineTo(at.x(cmd[1]), at.y(cmd[2]));
    if (cmd[0] === "C") return appendBezierCurve(at.x(cmd[1]), at.y(cmd[2]), at.x(cmd[3]), at.y(cmd[4]), at.x(cmd[5]), at.y(cmd[6]));
    return closePath();
  });
}

const fillEvenOdd = () => PDFOperator.of("f*" as PDFOperatorNames);

function alphaOps(context: GlyphContext, page: PDFPage, alpha: number) {
  return alpha < 1 ? [setGraphicsState(opacityState(context, page, Math.round(alpha * 1000) / 1000))] : [];
}

/** A shading for `geometry` (card millimetres mapped by `at`), registered on the page; returns its name. */
function shading(context: GlyphContext, page: PDFPage, geometry: GradientGeometry, at: PagePoint): PDFName {
  const stops = fullStops(geometry.stops);
  const pdf = context.pdf.context;
  const segment = (a: string, b: string) => pdf.obj({ FunctionType: 2, Domain: [0, 1], C0: rgbArray(a), C1: rgbArray(b), N: 1 });
  const fn = stops.length === 2
    ? segment(stops[0]!.color, stops[1]!.color)
    : pdf.obj({
      FunctionType: 3, Domain: [0, 1],
      Functions: stops.slice(1).map((stop, index) => segment(stops[index]!.color, stop.color)),
      Bounds: stops.slice(1, -1).map((stop) => stop.atPct / 100),
      Encode: stops.slice(1).flatMap(() => [0, 1]),
    });
  const coords = geometry.type === "linear"
    ? [at.x(geometry.x1), at.y(geometry.y1), at.x(geometry.x2), at.y(geometry.y2)]
    : [at.x(geometry.cx), at.y(geometry.cy), 0, at.x(geometry.cx), at.y(geometry.cy), geometry.r * PT_PER_MM];
  const dict = pdf.obj({ ShadingType: geometry.type === "linear" ? 2 : 3, ColorSpace: "DeviceRGB", Coords: coords, Function: fn, Extend: [true, true] });
  const ref: PDFRef = pdf.register(dict);
  const resources = page.node.normalizedEntries().Resources;
  let shadings = resources.lookupMaybe(PDFName.of("Shading"), PDFDict);
  if (!shadings) {
    shadings = pdf.obj({});
    resources.set(PDFName.of("Shading"), shadings);
  }
  const name = PDFName.of(`Sh${shadings.keys().length + 1}`);
  shadings.set(name, ref);
  return name;
}

export function vectorPdf(context: GlyphContext, page: PDFPage, op: VectorOp, alpha: number, at: PagePoint) {
  const opacity = alpha * (op.opacity ?? 1);
  const path = pathOps(op.cmds, at);
  const ops: PDFOperator[] = [pushGraphicsState(), ...alphaOps(context, page, opacity)];
  if (op.gradient) {
    ops.push(pushGraphicsState(), ...path, clipEvenOdd(), endPath(), PDFOperator.of("sh" as PDFOperatorNames, [shading(context, page, op.gradient, at)]), popGraphicsState());
  } else if (op.fill) {
    ops.push(setFillingColor(hexColor(op.fill)), ...path, op.nonzero ? fill() : fillEvenOdd());
  }
  if (op.stroke && op.strokeWidth) {
    ops.push(setStrokingColor(hexColor(op.stroke)), setLineWidth(op.strokeWidth * PT_PER_MM), setLineJoin(LineJoinStyle.Round), setLineCap(op.round ? LineCapStyle.Round : LineCapStyle.Butt));
    if (op.dash?.length) ops.push(setDashPattern(op.dash.map((value) => value * PT_PER_MM), 0));
    ops.push(...path, stroke());
  }
  ops.push(popGraphicsState());
  page.pushOperators(...ops);
}

export function clipPdf(context: GlyphContext, page: PDFPage, op: ClipOp, alpha: number, at: PagePoint) {
  page.pushOperators(pushGraphicsState(), ...pathOps(op.cmds, at), clipEvenOdd(), endPath());
  for (const inner of op.ops) vectorPdf(context, page, inner, alpha, at);
  page.pushOperators(popGraphicsState());
}

/** Icons keep their own path syntax (arcs and relative moves), so pdf-lib parses them as the SVG renderer does. */
export function iconPdf(context: GlyphContext, page: PDFPage, op: IconOp, alpha: number, at: PagePoint) {
  const opacity = alpha * (op.opacity ?? 1);
  page.pushOperators(pushGraphicsState(), ...alphaOps(context, page, opacity), setLineJoin(LineJoinStyle.Round));
  page.drawSvgPath(op.d, { x: at.x(op.x), y: at.y(op.y), scale: op.scale * PT_PER_MM, borderColor: hexColor(op.stroke), borderWidth: op.strokeWidth / op.scale, borderLineCap: LineCapStyle.Round });
  page.pushOperators(popGraphicsState());
}
