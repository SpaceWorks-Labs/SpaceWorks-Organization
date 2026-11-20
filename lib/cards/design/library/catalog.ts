import { MAX_LAYERS, type CardLayer } from "../layerTypes";
import { BADGES } from "./badges";
import { BANDS } from "./bands";
import { centred, iconLayer, idMaker, shortSide, type LibraryCategory, type LibraryContext, type LibraryItem } from "./base";
import { GRADIENT_FILLS, PATTERN_FILLS, TEXT_STYLES } from "./fills";
import { CODES, DIVIDERS, PHOTOS } from "./pieces";
import { SHAPES } from "./shapes";

/*
 * The Elements panel's library: every category, in panel order, plus icons (built from the icon
 * set by the panel, so this module stays free of the artwork). Search matches labels and keywords.
 */

export const LIBRARY: readonly LibraryCategory[] = [SHAPES, BANDS, BADGES, DIVIDERS, CODES, PHOTOS, TEXT_STYLES, GRADIENT_FILLS, PATTERN_FILLS];
export const ICONS_CATEGORY = { id: "icons", label: "Icons" } as const;

/** An icon a quarter of the short side across, in the first brand colour. */
export function iconElement(ctx: LibraryContext, icon: string, label: string): CardLayer[] {
  const size = shortSide(ctx) * 0.24;
  return [iconLayer(idMaker(ctx), centred(ctx, size, size), label, icon, ctx.colours.primary)];
}

const words = (query: string) => query.trim().toLowerCase().split(/\s+/).filter(Boolean);

/** Whether every word of `query` appears in the label or keywords. */
export function matchesQuery(query: string, label: string, keywords = "") {
  const haystack = `${label} ${keywords}`.toLowerCase();
  return words(query).every((word) => haystack.includes(word));
}

export function searchLibrary(query: string): LibraryItem[] {
  if (!words(query).length) return [];
  return LIBRARY.flatMap((category) => category.items.filter((item) => matchesQuery(query, item.label, item.keywords)));
}

/** Whether `count` more layers still fit on the side. */
export const fits = (current: number, count: number) => current + count <= MAX_LAYERS;
