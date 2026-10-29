import catalogue from "./card-fonts.json";

/*
 * Typefaces a card's own text can use: Gilroy (the brand face, the default) plus the open-licence
 * library in public/fonts/card (scripts/sync-card-fonts.mjs, licences in public/fonts/card/LICENSES.md).
 * Every face falls back to Noto Sans for what it lacks (extended Latin, ₹, Malayalam, Devanagari), on
 * the server (lib/cards/fonts.ts) and in the browser (components/cards/cardFonts.tsx) alike.
 */

export type CardFontCategory = "brand" | "sans" | "serif" | "display" | "script" | "mono" | "indic";
type CardFontWeight = 400 | 700;

type CardFontFamily = {
  id: string;
  label: string;
  category: CardFontCategory;
  /** Files per weight, in fallback order, with the unicode range each covers (browser only). */
  files: Record<CardFontWeight, Array<{ path: string; unicodeRange: string | null }>>;
};

export const DEFAULT_CARD_FONT = "gilroy";

export const CARD_FONT_CATEGORY_LABELS: Record<CardFontCategory, string> = {
  brand: "Brand",
  sans: "Sans serif",
  serif: "Serif",
  display: "Display",
  script: "Handwriting and script",
  mono: "Monospace",
  indic: "Malayalam and Devanagari",
};

type CatalogueEntry = { id: string; label: string; category: CardFontCategory; regular: number; bold: number; subsets: Array<{ name: string; unicodeRange: string }> };

const GILROY: CardFontFamily = {
  id: DEFAULT_CARD_FONT,
  label: "Gilroy",
  category: "brand",
  files: { 400: [{ path: "/brand/fonts/Gilroy-Light.woff2", unicodeRange: null }], 700: [{ path: "/brand/fonts/Gilroy-ExtraBold.woff2", unicodeRange: null }] },
};

function family(entry: CatalogueEntry): CardFontFamily {
  const files = (weight: number) => entry.subsets.map((subset) => ({ path: `/fonts/card/${entry.id}/${subset.name}-${weight}.woff2`, unicodeRange: subset.unicodeRange }));
  return { id: entry.id, label: entry.label, category: entry.category, files: { 400: files(entry.regular), 700: files(entry.bold) } };
}

export const CARD_FONTS: readonly CardFontFamily[] = [GILROY, ...(catalogue.families as CatalogueEntry[]).map(family)];

const BY_ID = new Map(CARD_FONTS.map((font) => [font.id, font]));

export function cardFont(id: string | null | undefined): CardFontFamily {
  return (id && BY_ID.get(id)) || GILROY;
}

/** The CSS family name a face is registered under in the browser. */
export function cardFontCssName(id: string) {
  return id === DEFAULT_CARD_FONT ? "SWO Card" : `SWO Card ${id}`;
}
