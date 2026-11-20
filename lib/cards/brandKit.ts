import { contrastRatio } from "@/lib/theme/accent";
import { CARD_FONTS } from "./fontCatalog";
import { BRAND } from "./palette";

/*
 * An organisation's brand kit for the card designer (CardBrandKit.kit): logo variants, colours and preferred
 * card fonts. Pure, so the browser and the server agree on what a valid kit is. Whether a logo is the
 * organisation's own upload is decided by the caller (`isOwnLogo`), on the server.
 */

export type CardBrandKit = { logos: string[]; colours: string[]; fonts: string[] };

export const BRAND_KIT_LIMITS = { logos: 8, colours: 12, fonts: 4 } as const;

export const EMPTY_BRAND_KIT: CardBrandKit = Object.freeze({ logos: [], colours: [], fonts: [] }) as CardBrandKit;

const HEX = /^#[0-9A-F]{6}$/;
const FONT_IDS = new Set(CARD_FONTS.map((font) => font.id));
const MAX_URL = 2048;

/** "#abc", "abc", "#aabbcc" or "AABBCC" as "#AABBCC"; anything else is null. */
export function normalizeHexColour(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let hex = value.trim().toUpperCase().replace(/^#/, "");
  if (/^[0-9A-F]{3}$/.test(hex)) hex = [...hex].map((char) => char + char).join("");
  const out = `#${hex}`;
  return HEX.test(out) ? out : null;
}

function uniqueStrings(value: unknown, limit: number, keep: (item: string) => string | null) {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const kept = typeof item === "string" ? keep(item) : null;
    if (kept && !out.includes(kept)) out.push(kept);
    if (out.length === limit) break;
  }
  return out;
}

/**
 * A valid kit from anything stored or sent: hex colours as #RRGGBB (12 at most), fonts from the card library
 * (4 at most), logos that pass `isOwnLogo` (8 at most). Duplicates and unknown values are dropped.
 */
export function normalizeBrandKit(value: unknown, isOwnLogo: (url: string) => boolean = () => false): CardBrandKit {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    logos: uniqueStrings(raw.logos, BRAND_KIT_LIMITS.logos, (url) => {
      const trimmed = url.trim();
      return trimmed.length > 0 && trimmed.length <= MAX_URL && isOwnLogo(trimmed) ? trimmed : null;
    }),
    colours: uniqueStrings(raw.colours, BRAND_KIT_LIMITS.colours, normalizeHexColour),
    fonts: uniqueStrings(raw.fonts, BRAND_KIT_LIMITS.fonts, (id) => (FONT_IDS.has(id) ? id : null)),
  };
}

/** WCAG AA for body text. */
export const AA_TEXT_CONTRAST = 4.5;
/** The darkest ink on cards: Deep Ink. */
export const DARK_INK = BRAND.ink;

export type ColourContrast = { onWhite: number; onDark: number; readableOnWhite: boolean; readableOnDark: boolean };

/** How a colour reads as text on white and on Deep Ink (WCAG contrast, rounded to one decimal place). */
export function colourContrast(hex: string): ColourContrast {
  const colour = normalizeHexColour(hex) ?? "#000000";
  const onWhite = Math.round(contrastRatio(colour, BRAND.white) * 10) / 10;
  const onDark = Math.round(contrastRatio(colour, DARK_INK) * 10) / 10;
  return { onWhite, onDark, readableOnWhite: contrastRatio(colour, BRAND.white) >= AA_TEXT_CONTRAST, readableOnDark: contrastRatio(colour, DARK_INK) >= AA_TEXT_CONTRAST };
}

/** Colours added to a kit, keeping the kit's order and its limit. */
export function mergeColours(kit: CardBrandKit, colours: readonly string[]): CardBrandKit {
  return { ...kit, colours: uniqueStrings([...kit.colours, ...colours], BRAND_KIT_LIMITS.colours, normalizeHexColour) };
}
