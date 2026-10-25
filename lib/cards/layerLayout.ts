import type { CardSideSettings } from "./design/elements";
import { fillLayerText, type CardLayer } from "./design/layers";
import { relativeLuminance } from "./palette";
import { paragraph, type TextMeasurer } from "./text";
import type { CardHolder } from "./types";
import type { CardOp } from "./layout";

/*
 * Drawing ops for a side's own layers and background (lib/cards/design/layers.ts). Each layer is
 * one group, turned about its centre and faded as a whole, exactly as the browser canvas draws it
 * with a CSS transform and opacity.
 */

/** Print economy: layer colours become black or white, whichever is nearer. */
export function monoColour(hex: string) {
  return relativeLuminance(hex) > 0.4 ? "#FFFFFF" : "#000000";
}

export function layerOps(layer: CardLayer, holder: CardHolder, measurer: TextMeasurer, mono: boolean): CardOp[] {
  if (layer.hidden || layer.opacityPct === 0) return [];
  const colour = (hex: string) => (mono ? monoColour(hex) : hex);
  const box = { x: layer.xMm, y: layer.yMm, w: layer.wMm, h: layer.hMm };
  let ops: CardOp[] = [];
  if (layer.kind === "text") {
    const filled = fillLayerText(layer.text, holder);
    const text = layer.uppercase ? filled.toLocaleUpperCase("en") : filled;
    ops = paragraph(measurer, text, box.x, box.y, box.w, { sizePt: layer.sizePt, weight: layer.bold ? 700 : 400, color: mono ? "#000000" : layer.color, trackingEm: layer.trackingEm, lineHeight: layer.lineHeight, font: layer.font }, layer.align).ops;
  } else if (layer.kind === "image") {
    // Corners round only a picture that fills its box, as the designer shows it.
    ops = [{ kind: "image", url: layer.url, ...box, fit: layer.fit, shape: "none", grayscale: mono || layer.grayscale, radiusMm: layer.fit === "cover" ? layer.radiusMm : 0, alpha: true }];
  } else if (layer.kind === "line") {
    ops = [{ kind: "rect", ...box, radius: 0, fill: colour(layer.color) }];
  } else if (layer.kind === "ellipse") {
    ops = [{ kind: "ellipse", ...box, ...(layer.fill ? { fill: colour(layer.fill) } : {}), ...(layer.stroke && layer.strokeMm > 0 ? { stroke: colour(layer.stroke), strokeWidth: layer.strokeMm } : {}) }];
  } else {
    ops = [{ kind: "rect", ...box, radius: Math.min(layer.radiusMm, box.w / 2, box.h / 2), ...(layer.fill ? { fill: colour(layer.fill) } : {}), ...(layer.stroke && layer.strokeMm > 0 ? { stroke: colour(layer.stroke), strokeWidth: layer.strokeMm } : {}) }];
  }
  if (ops.length === 0) return [];
  return [{ kind: "group", rotateDeg: layer.rotationDeg, cx: box.x + box.w / 2, cy: box.y + box.h / 2, opacity: layer.opacityPct / 100, ops }];
}

/** The background image, under the watermark and everything else. */
export function backgroundOps(settings: CardSideSettings, mono: boolean): CardOp[] {
  const background = settings.background;
  if (!background.imageUrl) return [];
  return [{
    kind: "group", rotateDeg: 0, cx: 0, cy: 0, opacity: background.opacityPct / 100,
    ops: [{ kind: "image", url: background.imageUrl, x: 0, y: 0, w: settings.widthMm, h: settings.heightMm, fit: background.fit, shape: "none", grayscale: mono, alpha: true }],
  }];
}
