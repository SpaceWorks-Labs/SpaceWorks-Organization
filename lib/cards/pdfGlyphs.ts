import "server-only";

import {
  appendBezierCurve,
  closePath,
  concatTransformationMatrix,
  drawObject,
  fill,
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

function glyphForm(context: GlyphContext, key: string, glyph: Glyph) {
  if (context.forms.has(key)) return context.forms.get(key)!;
  const ops = outline(glyph);
  let ref: PDFRef | null = null;
  if (ops.length > 0) {
    const box = glyph.path.cbox;
    const stream = context.pdf.context.formXObject([...ops, fill()], { BBox: [box.minX, box.minY, box.maxX, box.maxY] });
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
  const ops: PDFOperator[] = [pushGraphicsState(), setFillingColor(color)];
  if (op.opacity !== undefined) ops.push(setGraphicsState(opacityState(context, page, op.opacity)));
  ops.push(concatTransformationMatrix(1, 0, 0, 1, xPt, yPt));
  if (op.rotateDeg) {
    // PDF space turns anticlockwise; the scene's angle is clockwise on the page.
    const angle = (-op.rotateDeg * Math.PI) / 180;
    ops.push(concatTransformationMatrix(Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0));
  }
  for (const placed of placeGlyphs(fonts, op.text, op.weight, op.sizePt, op.trackingEm, op.font)) {
    const ref = glyphForm(context, placed.key, placed.glyph);
    if (!ref) continue;
    const scale = placed.scale * PT_PER_MM;
    ops.push(pushGraphicsState(), concatTransformationMatrix(scale, 0, 0, scale, placed.x * PT_PER_MM, -placed.y * PT_PER_MM), drawObject(nameOn(context, page, placed.key, ref)), popGraphicsState());
  }
  ops.push(popGraphicsState());
  page.pushOperators(...ops);
}
