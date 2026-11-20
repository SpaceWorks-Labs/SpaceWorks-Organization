import { cardFont, DEFAULT_CARD_FONT } from "@/lib/cards/fontCatalog";
import { cardIcon } from "./icons";
import {
  GROUP_ID_PATTERN,
  IMAGE_MASKS,
  LAYER_ID_PATTERN,
  LAYER_KINDS,
  LAYER_TEXT_MAX,
  PHOTO_MASKS,
  SHAPE_TYPES,
  TEXT_CASES,
  TEXT_EFFECTS,
  type CardLayer,
  type CardTextCase,
  type ShapePaint,
} from "./layerTypes";
import { artworkUrl, bool, gradient, hexColour, int, num, oneOf, pattern, record, shadow, str } from "./layerValues";
import { normalizeShapePath } from "./path";

/*
 * One stored layer made safe to draw. Layers saved before the newer kinds and settings existed come
 * back exactly as they were (every new setting defaults to "off"); the newer kinds are checked
 * strictly and dropped (null) when their essentials are wrong: an unknown shape, an empty custom
 * path, an icon outside the set or an image that isn't a managed upload.
 */

type Card = { widthMm: number; heightMm: number };
type Input = Record<string, unknown>;

function paint(input: Input): ShapePaint {
  return { fill: hexColour(input.fill), gradient: gradient(input.gradient), pattern: pattern(input.pattern), stroke: hexColour(input.stroke), strokeMm: num(input.strokeMm, 0, 5, 0.3), shadow: shadow(input.shadow) };
}

function textCase(input: Input): CardTextCase {
  const chosen = oneOf(input.textCase, TEXT_CASES, "none");
  return chosen === "none" && input.uppercase === true ? "upper" : chosen;
}

function base(input: Input & { id: string }, kind: CardLayer["kind"], card: Card) {
  const span = Math.max(card.widthMm, card.heightMm) * 2;
  const thin = kind === "line";
  const wMm = num(input.wMm, 1, span, 20);
  const hMm = num(input.hMm, thin ? 0.1 : 1, span, thin ? 0.5 : 10);
  return {
    id: input.id,
    name: str(input.name, 40),
    xMm: num(input.xMm, -wMm + 1, card.widthMm - 1, 0),
    yMm: num(input.yMm, -hMm + 0.1, card.heightMm - 0.1, 0),
    wMm,
    hMm,
    rotationDeg: num(input.rotationDeg, -180, 180, 0),
    opacityPct: int(input.opacityPct, 0, 100, 100),
    hidden: bool(input.hidden),
    locked: bool(input.locked),
    flipX: bool(input.flipX),
    flipY: bool(input.flipY),
    groupId: typeof input.groupId === "string" && GROUP_ID_PATTERN.test(input.groupId) ? input.groupId : null,
  };
}

export function normalizeLayer(value: unknown, card: Card): CardLayer | null {
  const input = record(value);
  if (!input || typeof input.id !== "string" || !LAYER_ID_PATTERN.test(input.id)) return null;
  const known = (LAYER_KINDS as readonly string[]).includes(input.kind as string);
  // Unknown kinds were always read as rectangles; keep that for old designs.
  const kind = known ? (input.kind as CardLayer["kind"]) : "rect";
  const b = base(input as Input & { id: string }, kind, card);
  switch (kind) {
    case "text": {
      const textCaseValue = textCase(input);
      return {
        ...b, kind,
        text: str(input.text, LAYER_TEXT_MAX),
        font: cardFont(typeof input.font === "string" ? input.font : DEFAULT_CARD_FONT).id,
        sizePt: num(input.sizePt, 4, 96, 10),
        bold: bool(input.bold),
        uppercase: textCaseValue === "upper",
        textCase: textCaseValue,
        align: oneOf(input.align, ["left", "center", "right"] as const, "left"),
        color: hexColour(input.color) ?? "#142C2A",
        // Letter spacing keeps hundredths of an em (the inspector steps by 0.01).
        trackingEm: Math.round(num(Number(input.trackingEm) * 100, -10, 50, 0)) / 100,
        lineHeight: num(input.lineHeight, 0.8, 2.5, 1.2),
        curve: int(input.curve, -100, 100, 0),
        effect: oneOf(input.effect, TEXT_EFFECTS, "none"),
        effectColor: hexColour(input.effectColor) ?? "#FFFFFF",
        effectMm: num(input.effectMm, 0.1, 3, 0.3),
        autoFit: bool(input.autoFit),
      };
    }
    case "image": {
      const url = artworkUrl(input.url);
      if (!url) return null;
      const crop = record(input.crop) ?? {};
      const adjust = record(input.adjust) ?? {};
      return {
        ...b, kind, url,
        fit: oneOf(input.fit, ["cover", "contain"] as const, "cover"),
        radiusMm: num(input.radiusMm, 0, 50, 0),
        grayscale: bool(input.grayscale),
        mask: oneOf(input.mask, IMAGE_MASKS, "none"),
        crop: { zoom: num(crop.zoom, 1, 5, 1), xPct: int(crop.xPct, 0, 100, 50), yPct: int(crop.yPct, 0, 100, 50) },
        adjust: { brightness: int(adjust.brightness, -100, 100, 0), contrast: int(adjust.contrast, -100, 100, 0), saturation: int(adjust.saturation, -100, 100, 0), blur: num(adjust.blur, 0, 20, 0) },
        shadow: shadow(input.shadow),
        alt: str(input.alt, 200),
      };
    }
    case "line":
      return { ...b, kind, color: hexColour(input.color) ?? "#142C2A", dash: oneOf(input.dash, ["solid", "dashed", "dotted"] as const, "solid") };
    case "shape": {
      if (!(SHAPE_TYPES as readonly string[]).includes(input.shape as string)) return null;
      const shape = input.shape as (typeof SHAPE_TYPES)[number];
      const path = shape === "path" ? normalizeShapePath(input.path) : "";
      if (shape === "path" && !path) return null;
      return { ...b, ...paint(input), kind, shape, points: int(input.points, 3, 24, 5), depthPct: int(input.depthPct, 5, 95, 50), radiusMm: num(input.radiusMm, 0, 50, 0), path };
    }
    case "icon": {
      if (typeof input.icon !== "string" || !cardIcon(input.icon)) return null;
      return { ...b, kind, icon: input.icon, color: hexColour(input.color) ?? "#142C2A", strokeMm: num(input.strokeMm, 0.1, 3, 0.4) };
    }
    case "qr":
      return { ...b, kind, dark: hexColour(input.dark) ?? "#000000", light: input.light === null ? null : hexColour(input.light) ?? "#FFFFFF" };
    case "barcode":
      return { ...b, kind, color: hexColour(input.color) ?? "#000000", background: input.background === null ? null : hexColour(input.background) ?? "#FFFFFF", showText: bool(input.showText, true) };
    case "photo":
      return { ...b, kind, mask: oneOf(input.mask, PHOTO_MASKS, "circle"), stroke: hexColour(input.stroke), strokeMm: num(input.strokeMm, 0, 5, 0.5), placeholder: hexColour(input.placeholder) ?? "" };
    default:
      return { ...b, ...paint(input), kind, radiusMm: kind === "rect" ? num(input.radiusMm, 0, 50, 0) : 0 };
  }
}
