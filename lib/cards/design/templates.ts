import type { CardSideSettings } from "./elements";
import { DEFAULT_ORDER } from "./layers";
import { normalizeCardSide, type CardDesignContext } from "./normalize";
import { defaultCardDesign, type CardDesign, type CardPreset } from "./presets";

/*
 * Ready-made card designs for the gallery: a preset's layout with its own colours, fonts and layers.
 * Decorative layers go under the built-in items unless they are meant to sit on top. Choosing one
 * keeps the answers a design prints.
 */

type Layer = Record<string, unknown> & { id: string; kind: string };
type SideLook = { patch?: Partial<CardSideSettings>; below?: Layer[]; above?: Layer[] };
type TemplateSpec = { label: string; hint: string; preset: CardPreset; front: SideLook; back: SideLook };

const shape = (id: string, kind: "rect" | "ellipse", x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}): Layer => ({ id, kind, xMm: x, yMm: y, wMm: w, hMm: h, ...extra });
const line = (id: string, x: number, y: number, w: number, thickness: number, color: string, extra: Record<string, unknown> = {}): Layer => ({ id, kind: "line", xMm: x, yMm: y, wMm: w, hMm: thickness, color, ...extra });
const text = (id: string, value: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown>): Layer => ({ id, kind: "text", text: value, xMm: x, yMm: y, wMm: w, hMm: h, ...extra });

const GOLD = "#C9A227";
const goldBorders = (prefix: string, width: number, height: number) => [
  line(`${prefix}top1`, 0, 1.5, width, 1, GOLD),
  line(`${prefix}top2`, 0, 3.1, width, 0.35, GOLD),
  line(`${prefix}bot1`, 0, height - 2.5, width, 1, GOLD),
  line(`${prefix}bot2`, 0, height - 3.45, width, 0.35, GOLD),
];

const TEMPLATES = {
  aurora: {
    label: "Aurora",
    hint: "Deep violet with glowing shapes, portrait",
    preset: "night",
    front: {
      patch: { backgroundColor: "custom", accentColor: "custom", customColours: { background: "#1E1446", accent: "#FF5FA2", text: "#FFFFFF" } },
      below: [shape("laurorapink", "ellipse", 24, -18, 50, 50, { fill: "#FF5FA2", opacityPct: 30 }), shape("lauroraviolet", "ellipse", -18, 60, 46, 46, { fill: "#6C4DFF", opacityPct: 55 })],
    },
    back: {
      patch: { backgroundColor: "custom", accentColor: "custom", customColours: { background: "#1E1446", accent: "#FF5FA2", text: "#FFFFFF" } },
      below: [shape("lauroraback", "ellipse", 20, 52, 50, 50, { fill: "#6C4DFF", opacityPct: 45 })],
    },
  },
  kasavu: {
    label: "Kasavu",
    hint: "Cream with gold borders and Malayalam, landscape",
    preset: "community",
    front: {
      patch: { accentColor: "custom", customColours: { background: "#FFF4E8", accent: "#A8781E", text: "#142C2A" } },
      above: [...goldBorders("lkasf", 85.6, 54), text("lkasftitle", "അംഗത്വ കാർഡ്", 5.1, 41, 55, 6, { font: "manjari", sizePt: 10, bold: true, color: "#8A6516" })],
    },
    back: { patch: { accentColor: "custom", customColours: { background: "#FFF4E8", accent: "#A8781E", text: "#142C2A" } }, above: goldBorders("lkasb", 85.6, 54) },
  },
  ribbon: {
    label: "Ribbon",
    hint: "White with a corner ribbon, landscape",
    preset: "student",
    front: {
      above: [
        shape("lribbonband", "rect", 58, 4, 40, 8, { fill: "#FF7447", rotationDeg: 45 }),
        text("lribbontext", "MEMBER", 58, 5.6, 40, 5, { font: "bebas-neue", sizePt: 11, align: "center", color: "#FFFFFF", trackingEm: 0.15, rotationDeg: 45, lineHeight: 1 }),
      ],
    },
    back: { above: [shape("lribbonback", "rect", 60, 42, 40, 8, { fill: "#FF7447", rotationDeg: -45 })] },
  },
  confetti: {
    label: "Confetti",
    hint: "White with a welcome note, portrait",
    preset: "corporate",
    front: {
      above: [
        text("lconfwelcome", "Welcome aboard", 6, 49.5, 30, 6, { font: "pacifico", sizePt: 10, color: "#006E63" }),
        shape("lconfa", "rect", 6, 58, 4, 4, { fill: "#FFD447", rotationDeg: 20 }),
        shape("lconfb", "ellipse", 14, 62, 3, 3, { fill: "#FF7447" }),
        shape("lconfc", "rect", 9, 68, 5, 2, { fill: "#B5CDFF", rotationDeg: -30 }),
        shape("lconfd", "ellipse", 21, 57, 2.5, 2.5, { fill: "#006E63" }),
        shape("lconfe", "rect", 22, 70, 3.5, 3.5, { fill: "#DFFF8F", rotationDeg: 45 }),
        shape("lconff", "ellipse", 6, 75, 4, 4, { fill: "#5B3FD9" }),
        line("lconfg", 14, 79, 8, 0.6, "#FF7447", { rotationDeg: 35 }),
      ],
    },
    back: { above: [shape("lconfbacka", "ellipse", 40, 40, 3, 3, { fill: "#FF7447" }), shape("lconfbackb", "rect", 44, 46, 4, 4, { fill: "#FFD447", rotationDeg: 20 })] },
  },
  midnight: {
    label: "Midnight gold",
    hint: "Black and gold with a serif, portrait",
    preset: "night",
    front: {
      patch: { backgroundColor: "custom", accentColor: "custom", customColours: { background: "#0B0B0F", accent: GOLD, text: "#F5EBD0" }, elementFonts: { header: "playfair-display", name: "playfair-display" } },
      above: [shape("lmidframe", "rect", 2, 2, 50, 81.6, { fill: null, stroke: GOLD, strokeMm: 0.4, radiusMm: 2 })],
    },
    back: {
      patch: { backgroundColor: "custom", accentColor: "custom", customColours: { background: "#0B0B0F", accent: GOLD, text: "#F5EBD0" }, elementFonts: { header: "playfair-display" } },
      above: [shape("lmidframeb", "rect", 2, 2, 50, 81.6, { fill: null, stroke: GOLD, strokeMm: 0.4, radiusMm: 2 })],
    },
  },
  sunrise: {
    label: "Sunrise",
    hint: "Deep Ink with warm suns, landscape",
    preset: "student",
    front: {
      patch: { accentColor: "ink", elementFonts: { name: "poppins" } },
      below: [shape("lsunbig", "ellipse", 55, 20, 50, 50, { fill: "#FFD447", opacityPct: 70 }), shape("lsunsmall", "ellipse", 72, 36, 30, 30, { fill: "#FF7447", opacityPct: 55 })],
    },
    back: {
      patch: { accentColor: "ink" },
      below: [shape("lsunback", "ellipse", 60, 25, 45, 45, { fill: "#FFD447", opacityPct: 60 })],
    },
  },
} satisfies Record<string, TemplateSpec>;

export type CardTemplateId = keyof typeof TEMPLATES;
export const CARD_TEMPLATES = Object.keys(TEMPLATES) as CardTemplateId[];
export const CARD_TEMPLATE_INFO: Record<CardTemplateId, { label: string; hint: string }> = TEMPLATES;

function sideFrom(base: CardSideSettings, look: SideLook, context: CardDesignContext) {
  const below = look.below ?? [];
  const above = look.above ?? [];
  return normalizeCardSide({ ...base, ...look.patch, layers: [...below, ...above], order: [...below.map((layer) => layer.id), ...DEFAULT_ORDER, ...above.map((layer) => layer.id)] }, context);
}

export function cardTemplateDesign(id: CardTemplateId, context: CardDesignContext): CardDesign {
  const spec: TemplateSpec = TEMPLATES[id];
  const base = defaultCardDesign(context, spec.preset);
  return { ...base, front: sideFrom(base.front, spec.front, context), back: sideFrom(base.back, spec.back, context) };
}

/** A template's front and back, keeping the answers and back setting already chosen. */
export function applyCardTemplate(design: CardDesign, id: CardTemplateId, context: CardDesignContext): CardDesign {
  const next = cardTemplateDesign(id, context);
  const keep = (fresh: CardSideSettings, old: CardSideSettings) => ({ ...fresh, printFieldKeys: old.printFieldKeys, printFieldLabels: old.printFieldLabels });
  return { ...next, backEnabled: design.backEnabled, front: keep(next.front, design.front), back: keep(next.back, design.back) };
}
