import type { CardSideSettings } from "./design/elements";
import { canFlip, type CardLayer } from "./design/layers";
import { layerOutline } from "./design/shapes";
import { barcodeOps, iconOps, imageOps, lineOps, photoOps, qrOps } from "./layerOps/markOps";
import { paintOps, plainPaint } from "./layerOps/paintOps";
import { textLayerOps } from "./layerOps/textOps";
import { relativeLuminance } from "./palette";
import type { TextMeasurer } from "./text";
import type { CardHolder } from "./types";
import type { CardOp } from "./layout";

/*
 * Drawing ops for a side's own layers and background (lib/cards/design/layers.ts). Each layer is
 * one group, turned about its centre and mirrored when flipped; its opacity fades each part it draws
 * (the PDF, the PNG and the browser canvas all fade parts, so overlapping parts look the same).
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
  if (layer.kind === "text") ops = textLayerOps(layer, holder, measurer, mono);
  else if (layer.kind === "image") ops = imageOps(layer, box, colour, mono);
  else if (layer.kind === "line") ops = lineOps(layer, box, colour);
  else if (layer.kind === "icon") ops = iconOps(layer, box, colour);
  else if (layer.kind === "qr") ops = qrOps(layer, box, holder, colour);
  else if (layer.kind === "barcode") ops = barcodeOps(layer, box, holder, measurer, colour);
  else if (layer.kind === "photo") ops = photoOps(layer, box, holder, measurer, colour, mono);
  else if (layer.kind === "shape" || !plainPaint(layer)) ops = paintOps(layer, layerOutline(layer) ?? [], box, colour);
  else {
    // The fill stops inside the outline, so the two never overlap: a faded shape then looks the same
    // whether a renderer fades each part or the layer as a whole.
    const stroke = layer.stroke && layer.strokeMm > 0 ? Math.min(layer.strokeMm, box.w / 2, box.h / 2) : 0;
    const inner = { x: box.x + stroke, y: box.y + stroke, w: box.w - 2 * stroke, h: box.h - 2 * stroke };
    const radius = Math.min(layer.radiusMm, box.w / 2, box.h / 2);
    if (layer.kind === "ellipse") {
      if (layer.fill && inner.w > 0 && inner.h > 0) ops.push({ kind: "ellipse", ...inner, fill: colour(layer.fill) });
      if (stroke) ops.push({ kind: "ellipse", ...box, stroke: colour(layer.stroke!), strokeWidth: stroke });
    } else {
      if (layer.fill && inner.w > 0 && inner.h > 0) ops.push({ kind: "rect", ...inner, radius: Math.max(0, radius - stroke), fill: colour(layer.fill) });
      if (stroke) ops.push({ kind: "rect", ...box, radius, stroke: colour(layer.stroke!), strokeWidth: stroke });
    }
  }
  if (ops.length === 0) return [];
  const flip = canFlip(layer) ? { ...(layer.flipX ? { flipX: true } : {}), ...(layer.flipY ? { flipY: true } : {}) } : {};
  return [{ kind: "group", rotateDeg: layer.rotationDeg, cx: box.x + box.w / 2, cy: box.y + box.h / 2, opacity: layer.opacityPct / 100, ...flip, ops }];
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
