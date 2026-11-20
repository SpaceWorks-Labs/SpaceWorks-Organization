import { PT_TO_MM } from "../design/elements";
import { barcodeText, code128 } from "../design/barcode";
import { cardIcon, ICON_VIEWBOX } from "../design/icons";
import type { CardBarcodeLayer, CardIconLayer, CardImageLayer, CardLineLayer, CardPhotoLayer, CardQrLayer } from "../design/layerTypes";
import { NO_ADJUST, NO_CROP } from "../design/layerTypes";
import { maskCmds } from "../design/shapes";
import type { CardOp } from "../layout";
import { relativeLuminance } from "../palette";
import type { TextMeasurer } from "../text";
import { holderInitials, type CardHolder } from "../types";
import { translateCmds } from "../vectorOps";
import { shadowOp } from "./paintOps";

/*
 * Ops for lines, icons, QR codes, barcodes, photos and pictures placed as layers. Every op is in card
 * millimetres; the caller wraps them in the layer's group (turn, flip, fade).
 */

type Colour = (hex: string) => string;
type Box = { x: number; y: number; w: number; h: number };

export const PHOTO_PLACEHOLDER = "#DCE7E5";

export function lineOps(layer: CardLineLayer, box: Box, colour: Colour): CardOp[] {
  if (layer.dash === "solid") return [{ kind: "rect", ...box, radius: 0, fill: colour(layer.color) }];
  const t = box.h;
  const dash = layer.dash === "dashed" ? [t * 3, t * 2] : [0.01, t * 2];
  const y = box.y + t / 2;
  // Dots are round caps on near-zero dashes, so they sit inside the line's length.
  const inset = layer.dash === "dotted" ? t / 2 : 0;
  return [{ kind: "vector", cmds: [["M", box.x + inset, y], ["L", box.x + box.w - inset, y]], stroke: colour(layer.color), strokeWidth: t, dash, round: layer.dash === "dotted" }];
}

export function iconOps(layer: CardIconLayer, box: Box, colour: Colour): CardOp[] {
  const icon = cardIcon(layer.icon);
  if (!icon) return [];
  const side = Math.min(box.w, box.h);
  const scale = side / ICON_VIEWBOX;
  return [{ kind: "icon", d: icon.d, x: box.x + (box.w - side) / 2, y: box.y + (box.h - side) / 2, scale, stroke: colour(layer.color), strokeWidth: layer.strokeMm }];
}

export function qrOps(layer: CardQrLayer, box: Box, holder: CardHolder, colour: Colour): CardOp[] {
  const side = Math.min(box.w, box.h);
  const [x, y] = [box.x + (box.w - side) / 2, box.y + (box.h - side) / 2];
  const pad = layer.light ? side * 0.06 : 0;
  const light = layer.light ? colour(layer.light) : "#FFFFFF";
  const ops: CardOp[] = layer.light ? [{ kind: "rect", x, y, w: side, h: side, radius: 0, fill: light }] : [];
  ops.push({ kind: "qr", value: holder.verifyUrl, x: x + pad, y: y + pad, size: side - 2 * pad, dark: colour(layer.dark), light });
  return ops;
}

export function barcodeOps(layer: CardBarcodeLayer, box: Box, holder: CardHolder, measurer: TextMeasurer, colour: Colour): CardOp[] {
  const value = barcodeText(holder.idNumber);
  const { bars, modules } = code128(value);
  const ops: CardOp[] = layer.background ? [{ kind: "rect", ...box, radius: 0, fill: colour(layer.background) }] : [];
  if (!modules) return ops;
  const textBand = layer.showText ? box.h * 0.26 : 0;
  const unit = box.w / modules;
  const barH = box.h - textBand;
  for (const [at, width] of bars) ops.push({ kind: "rect", x: box.x + at * unit, y: box.y, w: width * unit, h: barH, radius: 0, fill: colour(layer.color) });
  if (layer.showText) {
    const text = measurer.clean(value);
    let sizePt = Math.max(4, (textBand * 0.78) / PT_TO_MM);
    const width = measurer.widthMm(text, 400, sizePt, 0.04, undefined, true);
    if (width > box.w * 0.95) sizePt = Math.max(4, (sizePt * box.w * 0.95) / width);
    const drawn = measurer.widthMm(text, 400, sizePt, 0.04, undefined, true);
    ops.push({ kind: "text", x: box.x + (box.w - drawn) / 2, baseline: box.y + box.h - measurer.descent * sizePt * PT_TO_MM, text, sizePt, weight: 400, color: colour(layer.color), trackingEm: 0.04, tabular: true });
  }
  return ops;
}

export function photoOps(layer: CardPhotoLayer, box: Box, holder: CardHolder, measurer: TextMeasurer, colour: Colour, mono: boolean): CardOp[] {
  const outline = translateCmds(maskCmds(layer.mask, box.w, box.h), box.x, box.y);
  const ops: CardOp[] = [];
  if (holder.photoUrl) {
    ops.push({ kind: "image", url: holder.photoUrl, ...box, fit: "cover", shape: "none", grayscale: mono, photo: true, alpha: true, art: { mask: layer.mask, crop: { ...NO_CROP }, adjust: { ...NO_ADJUST } } });
  } else {
    const fill = colour(layer.placeholder || PHOTO_PLACEHOLDER);
    ops.push({ kind: "vector", cmds: outline, fill });
    const initials = measurer.clean(holderInitials(holder.displayName)) || "?";
    const side = Math.min(box.w, box.h);
    const sizePt = (side * 0.36) / PT_TO_MM;
    const width = measurer.widthMm(initials, 700, sizePt);
    ops.push({
      kind: "text", x: box.x + (box.w - width) / 2,
      baseline: box.y + box.h / 2 + ((measurer.ascent - measurer.descent) * sizePt * PT_TO_MM) / 2 - sizePt * PT_TO_MM * 0.08,
      text: initials, sizePt, weight: 700, color: relativeLuminance(fill) > 0.4 ? "#142C2A" : "#FFFFFF", trackingEm: 0,
    });
  }
  if (layer.stroke && layer.strokeMm > 0) ops.push({ kind: "vector", cmds: outline, stroke: colour(layer.stroke), strokeWidth: layer.strokeMm });
  return ops;
}

export function imageOps(layer: CardImageLayer, box: Box, colour: Colour, mono: boolean): CardOp[] {
  // Corners round only a picture that fills its box, as the designer shows it.
  const radiusMm = layer.fit === "cover" ? layer.radiusMm : 0;
  const ops: CardOp[] = [];
  if (layer.shadow) {
    const outline = maskCmds(layer.mask === "none" ? "square" : layer.mask, box.w, box.h, radiusMm);
    ops.push(shadowOp(outline, box, layer.shadow, colour));
  }
  const plain = layer.mask === "none" && layer.crop.zoom === 1 && layer.crop.xPct === 50 && layer.crop.yPct === 50 && Object.values(layer.adjust).every((value) => value === 0);
  ops.push({
    kind: "image", url: layer.url, ...box, fit: layer.fit, shape: "none", grayscale: mono || layer.grayscale, radiusMm, alpha: true,
    ...(plain ? {} : { art: { mask: layer.mask, crop: layer.crop, adjust: layer.adjust } }),
  });
  return ops;
}
