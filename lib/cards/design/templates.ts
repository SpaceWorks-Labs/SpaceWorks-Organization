import { resolveCardPalette } from "@/lib/cards/palette";
import { round1, type CardSideSettings } from "./elements";
import { DEFAULT_ORDER } from "./layers";
import { normalizeCardSide, type CardDesignContext } from "./normalize";
import { LANDSCAPE, lookSide, LOOKS, PORTRAIT, type CardDesign, type CardPreset, type PresetLook } from "./presets";
import { line, shape, text, type Layer } from "./sides";

/*
 * Ready-made card designs for the gallery: a preset's look (or one of their own) with its own colours,
 * fonts and layers. Every front prints the organisation and its logo, the photo, the name, role, units,
 * plan, number, validity and the QR code with "Scan to verify"; every back prints the plan, number and
 * validity, the organisation's contact details, a signature line and how to check the card
 * (lib/cards/design/sides.ts). Decoration stays inside the card's safe area: no stripes along the edges.
 * Decorative layers go under the built-in items unless they are meant to sit on top. Choosing one keeps
 * the answers a design prints.
 */

type SideLook = { patch?: Partial<CardSideSettings>; below?: Layer[]; above?: Layer[]; shiftMm?: number };
type TemplateSpec = { label: string; hint: string; preset: CardPreset; look?: Partial<PresetLook>; front: SideLook; back: SideLook };

const GOLD = "#C9A227";
const L = LANDSCAPE;
const P = PORTRAIT;

const aurora: Partial<CardSideSettings> = { backgroundColor: "custom", accentColor: "custom", customColours: { background: "#1E1446", accent: "#FF5FA2", text: "#FFFFFF" } };
const kasavu: Partial<CardSideSettings> = { accentColor: "custom", customColours: { background: "#FFF4E8", accent: "#A8781E", text: "#142C2A" } };
const midnight: Partial<CardSideSettings> = { backgroundColor: "custom", accentColor: "custom", customColours: { background: "#0B0B0F", accent: GOLD, text: "#F5EBD0" } };
const goldFrame = (id: string) => shape(id, "rect", 2.4, 2.4, P.widthMm - 4.8, P.heightMm - 4.8, { name: "Frame", fill: null, stroke: GOLD, strokeMm: 0.35, radiusMm: 2.5 });
/** A lanyard slot: where the punch goes, centred near the top edge. */
const slot = (id: string, widthMm: number) => shape(id, "rect", round1((widthMm - 14) / 2), 2.2, 14, 3, { name: "Lanyard slot", fill: "#E9E5DD", stroke: "#B9B1A3", strokeMm: 0.2, radiusMm: 1.5 });

const TEMPLATES = {
  "standard-portrait": { label: "Standard portrait", hint: "Photo, name, role, units, plan, number, validity and QR, portrait", preset: "corporate", front: {}, back: {} },
  "standard-landscape": { label: "Standard landscape", hint: "Photo, name, role, units, plan, number, validity and QR, landscape", preset: "student", front: {}, back: {} },
  "corporate-landscape": {
    label: "Corporate", hint: "White with a Deep Ink band and a clean sans, landscape", preset: "student",
    look: { accentColor: "ink" },
    front: { patch: { elementFonts: { name: "inter", header: "inter" } } },
    back: { patch: { elementFonts: { header: "inter" } } },
  },
  "corporate-portrait": {
    label: "Corporate portrait", hint: "White with a Deep Ink band and a clean sans, portrait", preset: "corporate",
    look: { photoShape: "rounded" },
    front: { patch: { elementFonts: { name: "inter", header: "inter" } } },
    back: { patch: { elementFonts: { header: "inter" } } },
  },
  "minimal-landscape": {
    label: "Minimal", hint: "White, no band or frame, type only, landscape", preset: "student",
    look: { template: "minimal", accentColor: "teal" },
    front: {}, back: {},
  },
  "minimal-portrait": {
    label: "Minimal portrait", hint: "White, no band or frame, type only, portrait", preset: "corporate",
    look: { template: "minimal", accentColor: "teal", photoShape: "rounded" },
    front: {}, back: {},
  },
  "badge-portrait": {
    label: "Lanyard badge", hint: "Room for a lanyard slot at the top, portrait", preset: "corporate",
    look: { accentColor: "teal", photoShape: "rounded" },
    front: { below: [slot("lslotf", P.widthMm)], shiftMm: 4 },
    back: { below: [slot("lslotb", P.widthMm)], shiftMm: 4 },
  },
  "badge-landscape": {
    label: "Lanyard badge landscape", hint: "Room for a lanyard slot at the top, landscape", preset: "student",
    look: { accentColor: "teal" },
    front: { below: [slot("lslotf", L.widthMm)], shiftMm: 3 },
    back: { below: [slot("lslotb", L.widthMm)], shiftMm: 3 },
  },
  aurora: {
    label: "Aurora", hint: "Deep violet with glowing shapes, portrait", preset: "night",
    front: { patch: aurora, below: [shape("laurorapink", "ellipse", 26, -16, 46, 46, { fill: "#FF5FA2", opacityPct: 28 }), shape("lauroraviolet", "ellipse", -20, 64, 42, 42, { fill: "#6C4DFF", opacityPct: 50 })] },
    back: { patch: aurora, below: [shape("lauroraback", "ellipse", 24, 54, 46, 46, { fill: "#6C4DFF", opacityPct: 40 })] },
  },
  kasavu: {
    label: "Kasavu", hint: "Warm Cream with a gold frame and Malayalam, landscape", preset: "community",
    front: { patch: kasavu, above: [text("lkasftitle", "അംഗത്വ കാർഡ്", 5.1, 44.6, 34, 5, { name: "Malayalam title", font: "manjari", sizePt: 9, bold: true, color: "#7A5A12" })] },
    back: { patch: kasavu },
  },
  ribbon: {
    label: "Ribbon", hint: "White with a corner ribbon, landscape", preset: "student",
    front: {
      above: [
        shape("lribbonband", "rect", 61, 5, 38, 7, { fill: "#FF7447", rotationDeg: 45 }),
        text("lribbontext", "MEMBER", 61, 6.4, 38, 5, { font: "bebas-neue", sizePt: 10, align: "center", color: "#142C2A", trackingEm: 0.15, rotationDeg: 45, lineHeight: 1 }),
      ],
    },
    back: {},
  },
  confetti: {
    label: "Confetti", hint: "White with a welcome note, portrait", preset: "corporate",
    front: {
      above: [
        text("lconfwelcome", "Welcome aboard", 30, 18, 20, 9, { font: "pacifico", sizePt: 8, color: "#006E63", lineHeight: 1.15 }),
        shape("lconfa", "rect", 31, 31, 3, 3, { fill: "#FFD447", rotationDeg: 20 }),
        shape("lconfb", "ellipse", 36.5, 34, 2.4, 2.4, { fill: "#FF7447" }),
        shape("lconfc", "rect", 41, 30.5, 4, 1.6, { fill: "#B5CDFF", rotationDeg: -30 }),
        shape("lconfd", "ellipse", 46, 34.5, 2, 2, { fill: "#006E63" }),
        shape("lconfe", "rect", 46, 27.5, 2.6, 2.6, { fill: "#DFFF8F", rotationDeg: 45 }),
        shape("lconff", "ellipse", 41.5, 36.5, 1.8, 1.8, { fill: "#5B3FD9" }),
        line("lconfg", 33, 37.5, 5, 0.5, "#FF7447", { rotationDeg: 35 }),
      ],
    },
    back: { above: [shape("lconfbacka", "ellipse", 42, 19, 2.6, 2.6, { fill: "#FF7447" }), shape("lconfbackb", "rect", 46, 23, 3.2, 3.2, { fill: "#FFD447", rotationDeg: 20 })] },
  },
  midnight: {
    label: "Midnight gold", hint: "Black and gold with a serif, portrait", preset: "night",
    front: { patch: { ...midnight, elementFonts: { header: "playfair-display", name: "playfair-display" } }, above: [goldFrame("lmidframe")] },
    back: { patch: { ...midnight, elementFonts: { header: "playfair-display" } }, above: [goldFrame("lmidframeb")] },
  },
  sunrise: {
    label: "Sunrise", hint: "Deep Ink with warm suns, landscape", preset: "student",
    front: {
      patch: { accentColor: "ink", elementFonts: { name: "poppins" } },
      below: [shape("lsunbig", "ellipse", 58, 22, 48, 48, { fill: "#FFD447", opacityPct: 60 }), shape("lsunsmall", "ellipse", 74, 38, 28, 28, { fill: "#FF7447", opacityPct: 45 })],
    },
    back: { patch: { accentColor: "ink" }, below: [shape("lsunback", "ellipse", 62, 26, 44, 44, { fill: "#FFD447", opacityPct: 50 })] },
  },
} satisfies Record<string, TemplateSpec>;

export type CardTemplateId = keyof typeof TEMPLATES;
export const CARD_TEMPLATES = Object.keys(TEMPLATES) as CardTemplateId[];
export const CARD_TEMPLATE_INFO: Record<CardTemplateId, { label: string; hint: string }> = TEMPLATES;

/** Layers the built-in sides add (units, contact, signature), drawn in the side's own text colour. */
const OWN_TEXT = /^l(units|back)/;
/** What a lanyard slot pushes down: everything stacked from the top. */
const FROM_TOP = ["header", "photo", "name", "role", "plan", "idNumber", "validUntil", "details"] as const;
const STACKED = new Set(["lunits", "lbackcontact"]);

function sideFrom(base: CardSideSettings, look: SideLook, context: CardDesignContext) {
  const merged = { ...base, ...look.patch };
  const ink = resolveCardPalette(merged, null).text;
  const shift = look.shiftMm ?? 0;
  const positions = { ...merged.elementPositions };
  if (shift) for (const item of FROM_TOP) positions[item] = { ...positions[item], yMm: round1(positions[item].yMm + shift) };
  const own = merged.layers.map((layer) => {
    const moved = shift && STACKED.has(layer.id) ? { ...layer, yMm: round1(layer.yMm + shift) } : layer;
    return OWN_TEXT.test(layer.id) && "color" in moved ? { ...moved, color: ink } : moved;
  });
  const below = look.below ?? [];
  const above = look.above ?? [];
  const builtIn = merged.order.filter((key) => !below.some((layer) => layer.id === key) && !above.some((layer) => layer.id === key));
  return normalizeCardSide({
    ...merged,
    elementPositions: positions,
    layers: [...below, ...own, ...above],
    order: [...below.map((layer) => layer.id), ...(builtIn.length ? builtIn : DEFAULT_ORDER), ...above.map((layer) => layer.id)],
  }, context);
}

export function cardTemplateDesign(id: CardTemplateId, context: CardDesignContext): CardDesign {
  const spec: TemplateSpec = TEMPLATES[id];
  const look = { ...LOOKS[spec.preset], ...spec.look };
  const front = lookSide(look, "front", context, { units: true });
  const back = lookSide(look, "back", context);
  return { version: 1, preset: spec.preset, backEnabled: true, front: sideFrom(front, spec.front, context), back: sideFrom(back, spec.back, context) };
}

/** A template's front and back, keeping the answers and back setting already chosen. */
export function applyCardTemplate(design: CardDesign, id: CardTemplateId, context: CardDesignContext): CardDesign {
  const next = cardTemplateDesign(id, context);
  const keep = (fresh: CardSideSettings, old: CardSideSettings) => ({ ...fresh, printFieldKeys: old.printFieldKeys, printFieldLabels: old.printFieldLabels });
  return { ...next, backEnabled: design.backEnabled, front: keep(next.front, design.front), back: keep(next.back, design.back) };
}
