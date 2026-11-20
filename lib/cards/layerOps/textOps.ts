import { PT_TO_MM } from "../design/elements";
import { fillLayerText } from "../design/layers";
import type { CardTextCase, CardTextLayer } from "../design/layerTypes";
import { curveGeometry } from "../design/textCurve";
import type { CardOp } from "../layout";
import { paragraph, type CardTextOp, type TextMeasurer } from "../text";
import type { CardHolder } from "../types";

/*
 * A text layer as glyph-outline text ops: placeholders filled, case changed, shrunk to fit its box when
 * asked, bent along an arc, and given its effect (highlight, outline, hollow or shadow). Text is never
 * drawn with a PDF font, only as shaped outlines (lib/cards/pdfGlyphs.ts).
 */

const graphemes = (text: string) => [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text)].map((part) => part.segment);

export function applyCase(text: string, textCase: CardTextCase) {
  if (textCase === "upper") return text.toLocaleUpperCase("en");
  if (textCase === "lower") return text.toLocaleLowerCase("en");
  if (textCase === "title") return text.replace(/(^|\s)(\S)/gu, (_match, space: string, first: string) => space + first.toLocaleUpperCase("en"));
  return text;
}

/** The size that lets the wrapped text fit the box height (down to 4 pt), or the layer's own size. */
export function fittedSizePt(layer: CardTextLayer, text: string, measurer: TextMeasurer) {
  if (!layer.autoFit || layer.curve !== 0) return layer.sizePt;
  let sizePt = layer.sizePt;
  const fits = (size: number) => {
    const block = paragraph(measurer, text, 0, 0, layer.wMm, { sizePt: size, weight: layer.bold ? 700 : 400, color: "#000000", trackingEm: layer.trackingEm, lineHeight: layer.lineHeight, font: layer.font });
    return block.bottom <= layer.hMm + 0.01;
  };
  while (sizePt > 4 && !fits(sizePt)) sizePt = Math.max(4, Math.round(sizePt * 9) / 10);
  return sizePt;
}

function curvedOps(layer: CardTextLayer, text: string, sizePt: number, color: string, measurer: TextMeasurer): CardTextOp[] {
  const weight = layer.bold ? 700 : 400;
  const chars = graphemes(measurer.clean(text).replace(/\s+/g, " ").trim());
  const advances = chars.map((char) => measurer.widthMm(char, weight, sizePt, layer.trackingEm, layer.font));
  const { ascent, descent } = measurer.metrics(layer.font);
  const placed = curveGeometry({ xMm: layer.xMm, yMm: layer.yMm, wMm: layer.wMm, hMm: layer.hMm, curve: layer.curve }, advances, ascent * sizePt * PT_TO_MM, descent * sizePt * PT_TO_MM);
  return chars.map((char, index) => ({ kind: "text", x: placed[index]!.x, baseline: placed[index]!.y, text: char, sizePt, weight, color, trackingEm: 0, ...(layer.font ? { font: layer.font } : {}), ...(placed[index]!.rotateDeg ? { rotateDeg: placed[index]!.rotateDeg } : {}) }));
}

export function textLayerOps(layer: CardTextLayer, holder: CardHolder, measurer: TextMeasurer, mono: boolean): CardOp[] {
  const text = applyCase(fillLayerText(layer.text, holder), layer.textCase);
  const sizePt = fittedSizePt(layer, text, measurer);
  const color = mono ? "#000000" : layer.color;
  const effectColor = mono ? (layer.effect === "highlight" ? "#FFFFFF" : "#000000") : layer.effectColor;
  const base = layer.curve !== 0
    ? curvedOps(layer, text, sizePt, color, measurer)
    : paragraph(measurer, text, layer.xMm, layer.yMm, layer.wMm, { sizePt, weight: layer.bold ? 700 : 400, color, trackingEm: layer.trackingEm, lineHeight: layer.lineHeight, font: layer.font }, layer.align).ops;
  const e = layer.effectMm;
  switch (layer.effect) {
    case "outline":
      return [...base.map((op) => ({ ...op, color: effectColor, stroke: effectColor, strokeWidth: e * 2, noFill: true })), ...base];
    case "hollow":
      return base.map((op) => ({ ...op, stroke: op.color, strokeWidth: e, noFill: true }));
    case "shadow":
      return [...base.map((op) => ({ ...op, x: op.x + e, baseline: op.baseline + e, color: effectColor })), ...base];
    case "highlight": {
      if (layer.curve !== 0) return base;
      const { ascent, descent } = measurer.metrics(layer.font);
      const size = sizePt * PT_TO_MM;
      const marks: CardOp[] = base.map((op) => {
        const width = measurer.widthMm(op.text, op.weight, sizePt, layer.trackingEm, layer.font);
        return { kind: "rect", x: op.x - e, y: op.baseline - ascent * size - e / 2, w: width + 2 * e, h: (ascent + descent) * size + e, radius: e / 2, fill: effectColor };
      });
      return [...marks, ...base];
    }
    default:
      return base;
  }
}
