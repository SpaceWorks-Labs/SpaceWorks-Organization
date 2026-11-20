import { BRAND } from "@/lib/cards/palette";
import { PT_TO_MM } from "../elements";
import type { CardGradient, CardPatternKind, CardTextLayer } from "../layerTypes";
import { centred, idMaker, rectLayer, textLayer, type LibraryCategory, type LibraryColours, type LibraryItem, type TextOptions } from "./base";

/* Text styles in the card fonts, ready gradients and patterned fills. */

type Style = { id: string; label: string; text: string; sizePt: number; font?: string; bold?: boolean; textCase?: CardTextLayer["textCase"]; trackingEm?: number; colour?: keyof LibraryColours };

const STYLES: Style[] = [
  { id: "heading", label: "Heading", text: "Heading", sizePt: 16, bold: true },
  { id: "subheading", label: "Subheading", text: "Subheading", sizePt: 11, bold: true, colour: "primary" },
  { id: "body", label: "Body text", text: "A line of text", sizePt: 8 },
  { id: "label", label: "Label", text: "Label", sizePt: 6, bold: true, textCase: "upper", trackingEm: 0.12, colour: "primary" },
  { id: "caption", label: "Caption", text: "Caption", sizePt: 6 },
  { id: "name", label: "Member name", text: "{name}", sizePt: 14, bold: true },
  { id: "number", label: "Card number", text: "{number}", sizePt: 9, font: "space-mono", trackingEm: 0.04 },
  { id: "serif", label: "Serif title", text: "Membership", sizePt: 14, font: "playfair-display", bold: true },
  { id: "script", label: "Script accent", text: "Member", sizePt: 18, font: "great-vibes", colour: "primary" },
  { id: "display", label: "Display capitals", text: "Member", sizePt: 16, font: "bebas-neue", textCase: "upper", trackingEm: 0.06 },
];

export const TEXT_STYLES: LibraryCategory = {
  id: "text",
  label: "Text styles",
  items: STYLES.map((style): LibraryItem => ({
    id: `text-${style.id}`,
    label: style.label,
    keywords: "text type words",
    frame: "element",
    make: (ctx) => {
      const box = centred(ctx, ctx.widthMm * 0.6, style.sizePt * PT_TO_MM * 1.2 + 0.6);
      const options: TextOptions = { text: style.text, color: ctx.colours[style.colour ?? "ink"], sizePt: style.sizePt, bold: style.bold ?? false, textCase: style.textCase ?? "none", trackingEm: style.trackingEm ?? 0, ...(style.font ? { font: style.font } : {}) };
      return [textLayer(idMaker(ctx), box, style.label, options)];
    },
  })),
};

const linear = (angleDeg: number, ...colours: string[]): CardGradient => ({ type: "linear", angleDeg, stops: colours.map((color, index) => ({ atPct: Math.round((index / (colours.length - 1)) * 100), color })) });
const radial = (...colours: string[]): CardGradient => ({ ...linear(0, ...colours), type: "radial" });

const GRADIENTS: Array<{ id: string; label: string; gradient: (colours: LibraryColours) => CardGradient }> = [
  { id: "brand", label: "Brand sweep", gradient: (c) => linear(0, c.primary, c.secondary) },
  { id: "brand-down", label: "Brand fade down", gradient: (c) => linear(90, c.primary, c.light) },
  { id: "three", label: "Three colours", gradient: (c) => linear(45, c.primary, c.secondary, c.tertiary) },
  { id: "sunrise", label: "Sunrise", gradient: () => linear(135, BRAND.orange, BRAND.yellow) },
  { id: "lagoon", label: "Lagoon", gradient: () => linear(135, BRAND.teal, BRAND.sky) },
  { id: "glow", label: "Radial glow", gradient: (c) => radial(c.tertiary, c.primary) },
];

export const GRADIENT_FILLS: LibraryCategory = {
  id: "gradients",
  label: "Gradients",
  items: GRADIENTS.map((entry): LibraryItem => ({
    id: `gradient-${entry.id}`,
    label: entry.label,
    keywords: "gradient fade colour",
    frame: "element",
    make: (ctx) => {
      const gradient = entry.gradient(ctx.colours);
      return [rectLayer(idMaker(ctx), centred(ctx, ctx.widthMm * 0.5, ctx.heightMm * 0.4), entry.label, { fill: gradient.stops[0]!.color, gradient, radiusMm: 2 })];
    },
  })),
};

const PATTERNS: Array<{ kind: CardPatternKind; label: string; angleDeg: number; scaleMm: number }> = [
  { kind: "dots", label: "Dots", angleDeg: 0, scaleMm: 2.5 },
  { kind: "stripes", label: "Stripes", angleDeg: 45, scaleMm: 3 },
  { kind: "grid", label: "Grid", angleDeg: 0, scaleMm: 3 },
  { kind: "waves", label: "Waves", angleDeg: 0, scaleMm: 4 },
];

export const PATTERN_FILLS: LibraryCategory = {
  id: "patterns",
  label: "Patterns",
  items: PATTERNS.flatMap((pattern): LibraryItem[] => [
    {
      id: `pattern-${pattern.kind}`,
      label: pattern.label,
      keywords: "pattern texture fill",
      frame: "element",
      make: (ctx) => [rectLayer(idMaker(ctx), centred(ctx, ctx.widthMm * 0.5, ctx.heightMm * 0.4), `${pattern.label} pattern`, { fill: ctx.colours.primary, radiusMm: 2, pattern: { kind: pattern.kind, color: ctx.colours.light, scaleMm: pattern.scaleMm, angleDeg: pattern.angleDeg } })],
    },
    {
      id: `pattern-${pattern.kind}-light`,
      label: `${pattern.label} on white`,
      keywords: "pattern texture fill light",
      frame: "element",
      make: (ctx) => [rectLayer(idMaker(ctx), centred(ctx, ctx.widthMm * 0.5, ctx.heightMm * 0.4), `${pattern.label} pattern`, { fill: BRAND.white, radiusMm: 2, pattern: { kind: pattern.kind, color: ctx.colours.primary, scaleMm: pattern.scaleMm, angleDeg: pattern.angleDeg } })],
    },
  ]),
};
