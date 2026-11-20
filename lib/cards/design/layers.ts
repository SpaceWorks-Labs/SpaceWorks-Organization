import { managedImageUrl } from "@/lib/cards/imageUrl";
import type { CardHolder } from "@/lib/cards/types";
import { ownUnit, unitAtLevel } from "@/lib/cards/units";
import { CARD_ELEMENTS, type CardElement } from "./elements";
import { normalizeLayer } from "./layerNormalize";
import { DEFAULT_BACKGROUND, MAX_LAYERS, type CardBackground, type CardLayer } from "./layerTypes";
import { artworkUrl, int, oneOf, record } from "./layerValues";

/*
 * A card side's own artwork, on top of the built-in items: text, uploaded images and shapes, each
 * placed, sized and turned in millimetres, plus a background colour and image under everything.
 * `order` stacks built-in items and layers together, bottom first, so text can sit on an image and
 * an image on a band. Shared by the designer canvas and the PDF/PNG renderer; normalised on every read.
 */

export * from "./layerTypes";
export { hexColour } from "./layerValues";

/** Built-in items bottom first, as cards stacked them before layers existed: text, then graphics. */
export const DEFAULT_ORDER: readonly CardElement[] = ["header", "name", "role", "plan", "idNumber", "validUntil", "details", "footer", "logo", "photo", "symbol", "qr"];

/**
 * Text placeholders filled per member. `unit` and `unitCode` are the member's own unit, `units` the
 * whole chain ("North · North 1"), and `level1`…`level4` the unit at each level, top first; the
 * designer labels those with the organisation's level names. A member without one prints nothing.
 */
export const LAYER_PLACEHOLDERS = ["name", "role", "plan", "number", "validUntil", "unit", "unitCode", "units", "level1", "level2", "level3", "level4", "website", "email", "phone", "contact", "organisation"] as const;
export type LayerPlaceholder = (typeof LAYER_PLACEHOLDERS)[number];

const PLACEHOLDER = new RegExp(`\\{(${LAYER_PLACEHOLDERS.join("|")})\\}`, "g");

export function fillLayerText(text: string, holder: Pick<CardHolder, "displayName" | "role" | "planName" | "idNumber" | "validUntil" | "units" | "contact" | "organisationName">) {
  const own = ownUnit(holder.units);
  const level = (n: number) => unitAtLevel(holder.units, n)?.name ?? "";
  const values: Record<LayerPlaceholder, string> = {
    name: holder.displayName,
    role: holder.role ?? "",
    plan: holder.planName ?? "",
    number: holder.idNumber ?? "",
    validUntil: holder.validUntil ?? "",
    unit: own?.name ?? "",
    unitCode: own?.code ?? "",
    units: (holder.units ?? []).map((unit) => unit.name).join(" · "),
    level1: level(0),
    level2: level(1),
    level3: level(2),
    level4: level(3),
    // The organisation's own public contact details (Settings), for the back of the card.
    website: holder.contact?.website ?? "",
    email: holder.contact?.email ?? "",
    phone: holder.contact?.phone ?? "",
    // Each detail stays whole on a line (a phone number never splits) and the dots stay with the item before.
    contact: [holder.contact?.website, holder.contact?.email, holder.contact?.phone].flatMap((item) => (item ? [item.trim().replace(/ +/g, "\u00A0")] : [])).join("\u00A0· "),
    organisation: holder.organisationName ?? "",
  };
  return text.replace(PLACEHOLDER, (_match, key: LayerPlaceholder) => values[key]);
}

export function normalizeLayers(value: unknown, card: { widthMm: number; heightMm: number }): CardLayer[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    const parsed = normalizeLayer(item, card);
    if (!parsed || seen.has(parsed.id)) return [];
    seen.add(parsed.id);
    return [parsed];
  }).slice(0, MAX_LAYERS);
}

export function normalizeBackground(value: unknown): CardBackground {
  const input = record(value);
  if (!input) return { ...DEFAULT_BACKGROUND };
  return { imageUrl: artworkUrl(input.imageUrl), fit: oneOf(input.fit, ["cover", "contain"] as const, "cover"), opacityPct: int(input.opacityPct, 5, 100, 100) };
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
