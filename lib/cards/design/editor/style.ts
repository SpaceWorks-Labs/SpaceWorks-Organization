import type { CardLayer, CardLayerKind } from "../layerTypes";

/*
 * "Copy style" (a format painter): take one layer's look and lay it on others. Layers of the same
 * family take every style setting; other kinds take what they share: opacity, the main colour and,
 * between filled shapes and pictures, the shadow. Position, size, words, pictures and ids never move.
 */

const FAMILY: Record<CardLayerKind, string> = { rect: "paint", ellipse: "paint", shape: "paint", text: "text", line: "line", icon: "icon", image: "image", photo: "photo", qr: "qr", barcode: "barcode" };

/** Style settings each family carries, beyond opacity. */
const STYLE_KEYS: Record<string, readonly string[]> = {
  paint: ["fill", "gradient", "pattern", "stroke", "strokeMm", "shadow"],
  text: ["font", "sizePt", "bold", "uppercase", "textCase", "align", "color", "trackingEm", "lineHeight", "curve", "effect", "effectColor", "effectMm"],
  line: ["color", "dash"],
  icon: ["color", "strokeMm"],
  image: ["radiusMm", "grayscale", "mask", "adjust", "shadow"],
  photo: ["mask", "stroke", "strokeMm"],
  qr: ["dark", "light"],
  barcode: ["color", "background"],
};

/** The property holding each kind's main colour (pictures have none). */
const MAIN_COLOUR: Partial<Record<CardLayerKind, string>> = { rect: "fill", ellipse: "fill", shape: "fill", text: "color", line: "color", icon: "color", barcode: "color", qr: "dark", photo: "stroke" };

export type CopiedStyle = { kind: CardLayerKind; values: Record<string, unknown>; opacityPct: number; colour: string | null; shadow: unknown };

export function copyStyle(layer: CardLayer): CopiedStyle {
  const source = layer as unknown as Record<string, unknown>;
  const values = Object.fromEntries(STYLE_KEYS[FAMILY[layer.kind]]!.filter((key) => key in source).map((key) => [key, structuredClone(source[key])]));
  const colourKey = MAIN_COLOUR[layer.kind];
  const colour = colourKey && typeof source[colourKey] === "string" ? (source[colourKey] as string) : null;
  return { kind: layer.kind, values, opacityPct: layer.opacityPct, colour, shadow: "shadow" in source ? structuredClone(source.shadow) : undefined };
}

/** Whether a copied style has anything to give `target` beyond opacity. */
export function styleFits(style: CopiedStyle, target: Pick<CardLayer, "kind">) {
  if (FAMILY[style.kind] === FAMILY[target.kind]) return true;
  return Boolean(style.colour && MAIN_COLOUR[target.kind]) || (style.shadow !== undefined && (FAMILY[target.kind] === "paint" || target.kind === "image"));
}

export function applyStyle(target: CardLayer, style: CopiedStyle): CardLayer {
  const next = { ...target, opacityPct: style.opacityPct } as Record<string, unknown>;
  if (FAMILY[style.kind] === FAMILY[target.kind]) {
    for (const [key, value] of Object.entries(style.values)) if (key in target) next[key] = structuredClone(value);
    return next as CardLayer;
  }
  const colourKey = MAIN_COLOUR[target.kind];
  if (colourKey && style.colour) next[colourKey] = style.colour;
  if (style.shadow !== undefined && "shadow" in target) next.shadow = structuredClone(style.shadow);
  return next as CardLayer;
}

/** Lay a copied style on every selected, unlocked layer. */
export function applyStyleTo(layers: readonly CardLayer[], ids: readonly string[], style: CopiedStyle): CardLayer[] {
  return layers.map((layer) => (ids.includes(layer.id) && !layer.locked ? applyStyle(layer, style) : layer));
}
