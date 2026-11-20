import { BRAND, resolveCardPalette } from "@/lib/cards/palette";
import { DEFAULT_CARD_FONT } from "@/lib/cards/fontCatalog";
import { newLayerId } from "../editor/clipboard";
import { newGroupId } from "../editor/groups";
import type { CardSideSettings } from "../elements";
import {
  LAYER_DEFAULTS, NO_ADJUST, NO_CROP, PAINT_DEFAULTS, TEXT_DEFAULTS,
  type CardBarcodeLayer, type CardIconLayer, type CardImageLayer, type CardLayer, type CardLineLayer, type CardPathShapeLayer,
  type CardPhotoLayer, type CardQrLayer, type CardShapeLayer, type CardShapeType, type CardTextLayer, type ShapePaint,
} from "../layerTypes";

/*
 * Building blocks of the element library: complete, valid layers sized to the side, in the brand
 * kit's colours when there is one, else the side's accent. Every number is rounded to 0.1 mm and
 * every colour is #RRGGBB in capitals, as normalising leaves them.
 */

export type LibraryColours = { primary: string; secondary: string; tertiary: string; ink: string; light: string };
export type LibraryContext = { widthMm: number; heightMm: number; taken: readonly string[]; colours: LibraryColours };
export type Box = { xMm: number; yMm: number; wMm: number; hMm: number };

const HEX = /^#[0-9A-F]{6}$/;
export const r1 = (value: number) => Math.round(value * 10) / 10;
export const shortSide = (ctx: Pick<LibraryContext, "widthMm" | "heightMm">) => Math.min(ctx.widthMm, ctx.heightMm);

/** The library's colours: the brand kit's first three, then the side's accent, Workshop Orange and Citron. */
export function libraryColours(side: Parameters<typeof resolveCardPalette>[0], brandColours: readonly string[] = []): LibraryColours {
  const palette = resolveCardPalette(side, null);
  const brand = brandColours.map((hex) => hex.trim().toUpperCase()).filter((hex) => HEX.test(hex));
  return { primary: brand[0] ?? palette.accent.toUpperCase(), secondary: brand[1] ?? BRAND.orange, tertiary: brand[2] ?? BRAND.citron, ink: palette.text.toUpperCase(), light: BRAND.white };
}

export function libraryContext(side: Pick<CardSideSettings, "widthMm" | "heightMm" | "layers" | "colorMode" | "backgroundColor" | "accentColor" | "textColor" | "customColours">, brandColours?: readonly string[]): LibraryContext {
  return { widthMm: side.widthMm, heightMm: side.heightMm, taken: side.layers.map((layer) => layer.id), colours: libraryColours(side, brandColours) };
}

/** Fresh layer ids for one element, and one group id shared by its layers. */
export function idMaker(ctx: LibraryContext) {
  const used = new Set(ctx.taken);
  return () => {
    const id = newLayerId(used);
    used.add(id);
    return id;
  };
}

/** Several layers that select and move together. */
export function grouped(layers: CardLayer[]): CardLayer[] {
  if (layers.length < 2) return layers;
  const groupId = newGroupId();
  return layers.map((layer) => ({ ...layer, groupId }));
}

/** A box of `w` × `h` centred on the side. */
export function centred(ctx: LibraryContext, wMm: number, hMm: number): Box {
  return { xMm: (ctx.widthMm - wMm) / 2, yMm: (ctx.heightMm - hMm) / 2, wMm, hMm };
}

type Id = () => string;
const frame = (id: Id, box: Box, name: string) => ({ ...LAYER_DEFAULTS, id: id(), name, xMm: r1(box.xMm), yMm: r1(box.yMm), wMm: r1(box.wMm), hMm: r1(box.hMm) });
type Flip = { flipX?: boolean; flipY?: boolean; rotationDeg?: number; opacityPct?: number };
type Paint = Partial<ShapePaint> & Flip;

export function rectLayer(id: Id, box: Box, name: string, paint: Paint & { radiusMm?: number } = {}): CardShapeLayer {
  return { ...frame(id, box, name), ...PAINT_DEFAULTS, radiusMm: 0, ...paint, kind: "rect" };
}

export function ellipseLayer(id: Id, box: Box, name: string, paint: Paint = {}): CardShapeLayer {
  return { ...frame(id, box, name), ...PAINT_DEFAULTS, radiusMm: 0, ...paint, kind: "ellipse" };
}

export function shapeLayer(id: Id, box: Box, name: string, shape: CardShapeType, paint: Paint & { points?: number; depthPct?: number; radiusMm?: number } = {}): CardPathShapeLayer {
  return { ...frame(id, box, name), ...PAINT_DEFAULTS, points: 5, depthPct: 50, radiusMm: 0, path: "", ...paint, kind: "shape", shape };
}

export function lineLayer(id: Id, box: Box, name: string, color: string, dash: CardLineLayer["dash"] = "solid"): CardLineLayer {
  return { ...frame(id, box, name), kind: "line", color, dash };
}

export type TextOptions = Partial<Omit<CardTextLayer, "kind" | "id" | "xMm" | "yMm" | "wMm" | "hMm">> & { text: string; color: string };
export function textLayer(id: Id, box: Box, name: string, options: TextOptions): CardTextLayer {
  const layer = { ...frame(id, box, name), ...TEXT_DEFAULTS, font: DEFAULT_CARD_FONT, sizePt: 10, ...options, kind: "text" as const };
  return { ...layer, uppercase: layer.textCase === "upper" };
}

export function iconLayer(id: Id, box: Box, name: string, icon: string, color: string): CardIconLayer {
  return { ...frame(id, box, name), kind: "icon", icon, color, strokeMm: 0.4 };
}

export function qrLayer(id: Id, box: Box, colours: LibraryColours): CardQrLayer {
  return { ...frame(id, box, "QR code"), kind: "qr", dark: colours.ink === BRAND.white ? BRAND.ink : colours.ink, light: BRAND.white };
}

export function barcodeLayer(id: Id, box: Box, colours: LibraryColours): CardBarcodeLayer {
  return { ...frame(id, box, "Barcode"), kind: "barcode", color: colours.ink === BRAND.white ? BRAND.ink : colours.ink, background: BRAND.white, showText: true };
}

export function photoLayer(id: Id, box: Box, name: string, mask: CardPhotoLayer["mask"], ring: string | null = null): CardPhotoLayer {
  return { ...frame(id, box, name), kind: "photo", mask, stroke: ring, strokeMm: 0.8, placeholder: "" };
}

/** An uploaded picture at its own aspect, at most 40% of the card across and 60% down, centred. */
export function imageElement(ctx: LibraryContext, url: string, aspect: number): CardLayer[] {
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  let wMm = ctx.widthMm * 0.4;
  let hMm = wMm / ratio;
  if (hMm > ctx.heightMm * 0.6) [hMm, wMm] = [ctx.heightMm * 0.6, ctx.heightMm * 0.6 * ratio];
  const image: CardImageLayer = { ...frame(idMaker(ctx), centred(ctx, Math.max(1, wMm), Math.max(1, hMm)), ""), kind: "image", url, fit: "cover", radiusMm: 0, grayscale: false, mask: "none", crop: { ...NO_CROP }, adjust: { ...NO_ADJUST }, shadow: null, alt: "" };
  return [image];
}

/**
 * One tile of the Elements panel. `frame` says how its thumbnail is drawn: on the whole card (bands,
 * borders, corners, whose place on the card is the point) or around the element itself.
 */
export type LibraryItem = { id: string; label: string; keywords?: string; frame: "card" | "element"; make: (ctx: LibraryContext) => CardLayer[] };
export type LibraryCategory = { id: string; label: string; items: LibraryItem[] };
