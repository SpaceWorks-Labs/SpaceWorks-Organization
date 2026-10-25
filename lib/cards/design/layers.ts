import { managedImageUrl } from "@/lib/cards/imageUrl";
import { cardFont, DEFAULT_CARD_FONT } from "@/lib/cards/fontCatalog";
import type { CardHolder } from "@/lib/cards/types";
import { CARD_ELEMENTS, clamp, round1, type CardElement } from "./elements";

/*
 * A card side's own artwork, on top of the built-in items: text, uploaded images and shapes, each
 * placed, sized and turned in millimetres, plus a background colour and image under everything.
 * `order` stacks built-in items and layers together, bottom first, so text can sit on an image and
 * an image on a band. Shared by the designer canvas and the PDF/PNG renderer; normalised on every read.
 */

export const LAYER_KINDS = ["text", "image", "rect", "ellipse", "line"] as const;
export type CardLayerKind = (typeof LAYER_KINDS)[number];
export const MAX_LAYERS = 30;
export const LAYER_TEXT_MAX = 400;
export const LAYER_ID_PATTERN = /^l[a-z0-9]{3,24}$/;
export const HEX_COLOUR = /^#[0-9A-F]{6}$/;

type LayerBase = { id: string; name: string; xMm: number; yMm: number; wMm: number; hMm: number; rotationDeg: number; opacityPct: number; hidden: boolean; locked: boolean };
export type CardTextLayer = LayerBase & { kind: "text"; text: string; font: string; sizePt: number; bold: boolean; uppercase: boolean; align: "left" | "center" | "right"; color: string; trackingEm: number; lineHeight: number };
export type CardImageLayer = LayerBase & { kind: "image"; url: string; fit: "cover" | "contain"; radiusMm: number; grayscale: boolean };
export type CardShapeLayer = LayerBase & { kind: "rect" | "ellipse"; fill: string | null; stroke: string | null; strokeMm: number; radiusMm: number };
/** A straight rule: `hMm` is its thickness; turn it for diagonals. */
export type CardLineLayer = LayerBase & { kind: "line"; color: string };
export type CardLayer = CardTextLayer | CardImageLayer | CardShapeLayer | CardLineLayer;

export type CardBackground = { imageUrl: string | null; fit: "cover" | "contain"; opacityPct: number };
export const DEFAULT_BACKGROUND: CardBackground = { imageUrl: null, fit: "cover", opacityPct: 100 };

/** Built-in items bottom first, as cards stacked them before layers existed: text, then graphics. */
export const DEFAULT_ORDER: readonly CardElement[] = ["header", "name", "role", "plan", "idNumber", "validUntil", "details", "footer", "logo", "photo", "symbol", "qr"];

/** Text placeholders filled per member. */
export const LAYER_PLACEHOLDERS = ["name", "role", "plan", "number", "validUntil"] as const;

export function fillLayerText(text: string, holder: Pick<CardHolder, "displayName" | "role" | "planName" | "idNumber" | "validUntil">) {
  const values: Record<(typeof LAYER_PLACEHOLDERS)[number], string> = {
    name: holder.displayName,
    role: holder.role ?? "",
    plan: holder.planName ?? "",
    number: holder.idNumber ?? "",
    validUntil: holder.validUntil ?? "",
  };
  return text.replace(/\{(name|role|plan|number|validUntil)\}/g, (_match, key: keyof typeof values) => values[key]);
}

const record = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
const num = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? round1(clamp(n, min, max)) : fallback;
};
const bool = (value: unknown, fallback = false) => (typeof value === "boolean" ? value : fallback);
const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => ((allowed as readonly string[]).includes(value as string) ? (value as T) : fallback);

export function hexColour(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  return HEX_COLOUR.test(upper) ? upper : null;
}

/** Card artwork must be a managed upload. Organisation checks happen in `scopeCardArtwork`. */
function artworkUrl(value: unknown) {
  return typeof value === "string" && /\/member-id-artwork\//.test(value) ? managedImageUrl(value) : null;
}

function layer(value: unknown, card: { widthMm: number; heightMm: number }): CardLayer | null {
  const input = record(value);
  if (!input || typeof input.id !== "string" || !LAYER_ID_PATTERN.test(input.id)) return null;
  const kind = oneOf(input.kind, LAYER_KINDS, "rect");
  const span = Math.max(card.widthMm, card.heightMm) * 2;
  const wMm = num(input.wMm, 1, span, 20);
  const hMm = num(input.hMm, kind === "line" ? 0.1 : 1, span, kind === "line" ? 0.5 : 10);
  const base: LayerBase = {
    id: input.id,
    name: typeof input.name === "string" ? input.name.slice(0, 40) : "",
    xMm: num(input.xMm, -wMm + 1, card.widthMm - 1, 0),
    yMm: num(input.yMm, -hMm + 0.1, card.heightMm - 0.1, 0),
    wMm,
    hMm,
    rotationDeg: num(input.rotationDeg, -180, 180, 0),
    opacityPct: Math.round(num(input.opacityPct, 0, 100, 100)),
    hidden: bool(input.hidden),
    locked: bool(input.locked),
  };
  if (kind === "text") {
    return {
      ...base, kind,
      text: typeof input.text === "string" ? input.text.slice(0, LAYER_TEXT_MAX) : "",
      font: cardFont(typeof input.font === "string" ? input.font : DEFAULT_CARD_FONT).id,
      sizePt: num(input.sizePt, 4, 96, 10),
      bold: bool(input.bold),
      uppercase: bool(input.uppercase),
      align: oneOf(input.align, ["left", "center", "right"] as const, "left"),
      color: hexColour(input.color) ?? "#142C2A",
      trackingEm: num(input.trackingEm, -0.1, 0.5, 0),
      lineHeight: num(input.lineHeight, 0.8, 2.5, 1.2),
    };
  }
  if (kind === "image") {
    const url = artworkUrl(input.url);
    if (!url) return null;
    return { ...base, kind, url, fit: oneOf(input.fit, ["cover", "contain"] as const, "cover"), radiusMm: num(input.radiusMm, 0, 50, 0), grayscale: bool(input.grayscale) };
  }
  if (kind === "line") return { ...base, kind, color: hexColour(input.color) ?? "#142C2A" };
  return { ...base, kind, fill: hexColour(input.fill), stroke: hexColour(input.stroke), strokeMm: num(input.strokeMm, 0, 5, 0.3), radiusMm: kind === "rect" ? num(input.radiusMm, 0, 50, 0) : 0 };
}

export function normalizeLayers(value: unknown, card: { widthMm: number; heightMm: number }): CardLayer[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    const parsed = layer(item, card);
    if (!parsed || seen.has(parsed.id)) return [];
    seen.add(parsed.id);
    return [parsed];
  }).slice(0, MAX_LAYERS);
}

export function normalizeBackground(value: unknown): CardBackground {
  const input = record(value);
  if (!input) return { ...DEFAULT_BACKGROUND };
  return { imageUrl: artworkUrl(input.imageUrl), fit: oneOf(input.fit, ["cover", "contain"] as const, "cover"), opacityPct: Math.round(num(input.opacityPct, 5, 100, 100)) };
}

/** Every built-in item and every layer exactly once, bottom first. Items missing from `value` go to the bottom, layers to the top. */
export function normalizeOrder(value: unknown, layers: readonly CardLayer[]): string[] {
  const known = new Set<string>([...CARD_ELEMENTS, ...layers.map((item) => item.id)]);
  const listed = Array.isArray(value) ? [...new Set(value.filter((key): key is string => typeof key === "string" && known.has(key)))] : [];
  const missingBuiltIns = DEFAULT_ORDER.filter((key) => !listed.includes(key));
  const missingLayers = layers.map((item) => item.id).filter((key) => !listed.includes(key));
  return [...missingBuiltIns, ...listed, ...missingLayers];
}

/** Drop artwork that isn't this organisation's own upload, so a design can only draw its own images. */
export function scopeCardArtwork<T extends { layers: CardLayer[]; background: CardBackground }>(side: T, organisationId: string): T {
  const own = (url: string | null) => managedImageUrl(url, { kind: "organisation", organisationId, category: "member-id-artwork" });
  return {
    ...side,
    background: { ...side.background, imageUrl: own(side.background.imageUrl) },
    layers: side.layers.filter((item) => item.kind !== "image" || own(item.url)),
  };
}
