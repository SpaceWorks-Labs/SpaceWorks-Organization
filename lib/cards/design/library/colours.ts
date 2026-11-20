import type { CardGradient, CardLayer, CardPattern, CardShadow } from "../layerTypes";
import type { CardDesign } from "../presets";

/*
 * Every colour a design uses, and replacing one colour everywhere. Both walk the same list of colour
 * fields, so a colour that appears in the list can always be replaced: fills, outlines, gradient
 * stops, patterns, shadows, text and its effect, lines, icons, both colours of the QR code and the
 * barcode, photo rings, and the side's own custom colours. Colours compare in capitals.
 */

/** Called for each colour; returns the colour to keep. `visible`: whether it shows on the card. */
type Visit = (hex: string, visible: boolean) => string;

const same = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

function gradient(value: CardGradient | null, visit: Visit) {
  return value ? { ...value, stops: value.stops.map((stop) => ({ ...stop, color: visit(stop.color, true) })) } : null;
}
const pattern = (value: CardPattern | null, visit: Visit) => (value ? { ...value, color: visit(value.color, true) } : null);
const shadow = (value: CardShadow | null, visit: Visit) => (value ? { ...value, color: visit(value.color, true) } : null);
const maybe = (value: string | null, visit: Visit, visible = true) => (value === null ? null : visit(value, visible));

/** The layer with each of its colours passed through `visit`. */
export function mapLayerColours(layer: CardLayer, visit: Visit): CardLayer {
  switch (layer.kind) {
    case "text":
      return { ...layer, color: visit(layer.color, true), effectColor: visit(layer.effectColor, layer.effect !== "none") };
    case "rect":
    case "ellipse":
    case "shape":
      return {
        ...layer,
        fill: maybe(layer.fill, visit, !layer.gradient),
        gradient: gradient(layer.gradient, visit),
        pattern: pattern(layer.pattern, visit),
        stroke: maybe(layer.stroke, visit, layer.strokeMm > 0),
        shadow: shadow(layer.shadow, visit),
      };
    case "image":
      return { ...layer, shadow: shadow(layer.shadow, visit) };
    case "line":
      return { ...layer, color: visit(layer.color, true) };
    case "icon":
      return { ...layer, color: visit(layer.color, true) };
    case "qr":
      return { ...layer, dark: visit(layer.dark, true), light: maybe(layer.light, visit) };
    case "barcode":
      return { ...layer, color: visit(layer.color, true), background: maybe(layer.background, visit) };
    case "photo":
      return { ...layer, stroke: maybe(layer.stroke, visit, layer.strokeMm > 0) };
  }
}

type Side = CardDesign["front"];
const CUSTOM_KEYS = [["background", "backgroundColor"], ["accent", "accentColor"], ["text", "textColor"]] as const;

function mapSideColours(side: Side, visit: Visit): Side {
  const customColours = { ...side.customColours };
  for (const [key, choice] of CUSTOM_KEYS) customColours[key] = visit(customColours[key], side[choice] === "custom" && side.colorMode !== "mono");
  return { ...side, customColours, layers: side.layers.map((layer) => mapLayerColours(layer, visit)) };
}

/** Every distinct colour the design shows, in the order they first appear (front, then back), in capitals. */
export function documentColours(design: Pick<CardDesign, "front" | "back">): string[] {
  const found = new Set<string>();
  const collect: Visit = (hex, visible) => {
    if (visible) found.add(hex.toUpperCase());
    return hex;
  };
  mapSideColours(design.front, collect);
  mapSideColours(design.back, collect);
  return [...found];
}

/** The design with every use of `from` (any case) turned into `to`, on both sides. */
export function replaceColour<T extends Pick<CardDesign, "front" | "back">>(design: T, from: string, to: string): T {
  const target = to.toUpperCase();
  const swap: Visit = (hex) => (same(hex, from) ? target : hex);
  return { ...design, front: mapSideColours(design.front, swap), back: mapSideColours(design.back, swap) };
}
