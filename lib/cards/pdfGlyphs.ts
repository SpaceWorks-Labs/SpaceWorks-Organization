import "server-only";

import {
  appendBezierCurve,
  closePath,
  concatTransformationMatrix,
  drawObject,
  fill,
  fillAndStroke,
  LineJoinStyle,
  rgb,
  setLineJoin,
  setLineWidth,
  setStrokingColor,
  stroke,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  setFillingColor,
  setGraphicsState,
  type Color,
  type PDFDocument,
  type PDFName,
  type PDFOperator,
  type PDFPage,
  type PDFRef,
} from "pdf-lib";
import type { Glyph } from "fontkit";
import { placeGlyphs, type CardFonts } from "./fonts";
import { PT_PER_MM } from "./sheet";
import type { CardTextOp } from "./text";

/*
 * Shaped text in PDFs. pdf-lib's own text drawing applies no positioning (GPOS), which breaks Indic
 * marks, so each shaped glyph's outline becomes a small form XObject, stored once per document and
 * placed with one `Do` per occurrence. The fill colour is set outside the form, so one form serves
 * every colour. Text is not selectable, which suits a printed card.
 */

export type GlyphContext = {
  pdf: PDFDocument;
  forms: Map<string, PDFRef | null>;
  names: WeakMap<PDFPage, Map<string, PDFName>>;
  states: WeakMap<PDFPage, Map<number, PDFName>>;
};

export function glyphContext(pdf: PDFDocument): GlyphContext {
  return { pdf, forms: new Map(), names: new WeakMap(), states: new WeakMap() };
}

const hexToColor = (hex: string) => {
  const v = Number.parseInt(hex.slice(1), 16);
  return rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
};

/** The glyph outline as PDF path operators, in font units (y up, like PDF). Quadratics become cubics. */
function outline(glyph: Glyph): PDFOperator[] {
  const ops: PDFOperator[] = [];
  let x = 0;
  let y = 0;
  for (const { command, args } of glyph.path.commands) {
    if (command === "moveTo") {
      ops.push(moveTo(args[0]!, args[1]!));
      [x, y] = [args[0]!, args[1]!];
    } else if (command === "lineTo") {
      ops.push(lineTo(args[0]!, args[1]!));
      [x, y] = [args[0]!, args[1]!];
    } else if (command === "quadraticCurveTo") {
      const [qx, qy, ex, ey] = args as [number, number, number, number];
      ops.push(appendBezierCurve(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey));
      [x, y] = [ex, ey];
    } else if (command === "bezierCurveTo") {
      ops.push(appendBezierCurve(args[0]!, args[1]!, args[2]!, args[3]!, args[4]!, args[5]!));
      [x, y] = [args[4]!, args[5]!];
    } else {
      ops.push(closePath());
    }
  }
  return ops;
}

type Paint = "fill" | "stroke" | "both";

/** One form per glyph and paint: filled (text), stroked (hollow text, outlines) or both. */
function glyphForm(context: GlyphContext, glyphKey: string, glyph: Glyph, paint: Paint = "fill") {
  const key = paint === "fill" ? glyphKey : `${glyphKey}:${paint}`;
  if (context.forms.has(key)) return context.forms.get(key)!;
  const ops = outline(glyph);
  let ref: PDFRef | null = null;
  if (ops.length > 0) {
    const box = glyph.path.cbox;
    // Strokes reach outside the outline: pad the box by the widest outline a layer can ask for.
    const pad = paint === "fill" ? 0 : Math.max(box.maxX - box.minX, box.maxY - box.minY);
    const paintOp = paint === "fill" ? fill() : paint === "stroke" ? stroke() : fillAndStroke();
    const stream = context.pdf.context.formXObject([...ops, paintOp], { BBox: [box.minX - pad, box.minY - pad, box.maxX + pad, box.maxY + pad] });
    ref = context.pdf.context.register(stream);
  }
  context.forms.set(key, ref);
  return ref;
}

function nameOn(context: GlyphContext, page: PDFPage, key: string, ref: PDFRef) {
  let names = context.names.get(page);
  if (!names) {
    names = new Map();
    context.names.set(page, names);
  }
  let name = names.get(key);
  if (!name) {
    name = page.node.newXObject("G", ref);
    names.set(key, name);
  }
  return name;
}

/** A page graphics state with fill and stroke opacity `opacity`, made once per page and value. */
export function opacityState(context: GlyphContext, page: PDFPage, opacity: number) {
  let states = context.states.get(page);
  if (!states) {
    states = new Map();
    context.states.set(page, states);
  }
  let name = states.get(opacity);
  if (!name) {
    name = page.node.newExtGState("GS", context.pdf.context.obj({ Type: "ExtGState", ca: opacity, CA: opacity }));
    states.set(opacity, name);
  }
  return name;
}

/** Draw one text op with its baseline origin at (`xPt`, `yPt`) in page space. */
export function drawShapedText(context: GlyphContext, fonts: CardFonts, page: PDFPage, op: CardTextOp, xPt: number, yPt: number, color: Color) {
  const outlineMm = op.stroke && op.strokeWidth ? op.strokeWidth : 0;
  const paint: Paint = outlineMm ? (op.noFill ? "stroke" : "both") : "fill";
  const ops: PDFOperator[] = [pushGraphicsState(), setFillingColor(color)];
  if (outlineMm) ops.push(setStrokingColor(hexToColor(op.stroke!)), setLineJoin(LineJoinStyle.Round));
  if (op.opacity !== undefined) ops.push(setGraphicsState(opacityState(context, page, op.opacity)));
  ops.push(concatTransformationMatrix(1, 0, 0, 1, xPt, yPt));
  if (op.rotateDeg) {
    // PDF space turns anticlockwise; the scene's angle is clockwise on the page.
    const angle = (-op.rotateDeg * Math.PI) / 180;
    ops.push(concatTransformationMatrix(Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0));
  }
  for (const placed of placeGlyphs(fonts, op.text, op.weight, op.sizePt, op.trackingEm, op.font, op.tabular)) {
    const ref = glyphForm(context, placed.key, placed.glyph, paint);
    if (!ref) continue;
    const scale = placed.scale * PT_PER_MM;
    const formKey = paint === "fill" ? placed.key : `${placed.key}:${paint}`;
    ops.push(pushGraphicsState(), concatTransformationMatrix(scale, 0, 0, scale, placed.x * PT_PER_MM, -placed.y * PT_PER_MM));
    // The outline width in glyph units, so it measures `strokeWidth` mm on the card.
    if (outlineMm) ops.push(setLineWidth(outlineMm / placed.scale));
    ops.push(drawObject(nameOn(context, page, formKey, ref)), popGraphicsState());
  }
  ops.push(popGraphicsState());
  page.pushOperators(...ops);
}
