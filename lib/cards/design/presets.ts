import {
  CARD_LINE_HEIGHT,
  CR80,
  DEFAULT_WATERMARK,
  PT_TO_MM,
  type CardLayoutFlags,
  type CardSideSettings,
} from "./elements";
import { layoutForPaper } from "./geometry";
import { DEFAULT_ORDER, scopeCardArtwork } from "./layers";
import { defaultCardSideSettings, normalizeCardSide, type CardDesignContext } from "./normalize";

/*
 * A member card design: a front and a back, each an ordinary card side, so the same canvas, PDF and
 * PNG renderers draw both. Stored per organisation, and optionally per plan (CardDesign rows).
 */

export const CARD_PRESETS = ["community", "corporate", "night", "student"] as const;
export type CardPreset = (typeof CARD_PRESETS)[number];
export type CardSide = "front" | "back";

export const CARD_PRESET_INFO: Record<CardPreset, { label: string; hint: string }> = {
  community: { label: "Community", hint: "Warm Cream with a teal frame, landscape" },
  corporate: { label: "Corporate", hint: "White with a Deep Ink band, portrait" },
  night: { label: "Night", hint: "Deep Ink with a Citron band, portrait" },
  student: { label: "Student", hint: "White with a Sky Blue band, landscape" },
};

export type CardDesign = {
  version: 1;
  preset: CardPreset;
  /** Print and show the back. When off, downloads are front-only. */
  backEnabled: boolean;
  front: CardSideSettings;
  back: CardSideSettings;
};

/** Upper bound for a stored design (front and back, with their layers), in bytes of JSON. */
export const CARD_DESIGN_MAX_BYTES = 128_000;

// Saved sizes are kept to 0.1 mm, so CR80's 53.98 mm is stored as 54.
const round1 = (mm: number) => Math.round(mm * 10) / 10;
const LANDSCAPE = { widthMm: round1(CR80.widthMm), heightMm: round1(CR80.heightMm) };
const PORTRAIT = { widthMm: round1(CR80.heightMm), heightMm: round1(CR80.widthMm) };

type PresetLook = Pick<CardSideSettings, "template" | "backgroundColor" | "accentColor" | "textColor" | "widthMm" | "heightMm" | "photoShape">;

const LOOKS: Record<CardPreset, PresetLook> = {
  community: { template: "classic", backgroundColor: "cream", accentColor: "teal", textColor: "auto", photoShape: "rounded", ...LANDSCAPE },
  corporate: { template: "bold", backgroundColor: "white", accentColor: "ink", textColor: "auto", photoShape: "circle", ...PORTRAIT },
  night: { template: "bold", backgroundColor: "ink", accentColor: "citron", textColor: "auto", photoShape: "rounded", ...PORTRAIT },
  student: { template: "bold", backgroundColor: "white", accentColor: "sky", textColor: "auto", photoShape: "rounded", ...LANDSCAPE },
};

function side(preset: CardPreset, which: CardSide, context: CardDesignContext): CardSideSettings {
  const look = LOOKS[preset];
  const front = which === "front";
  const flags: Required<CardLayoutFlags> = {
    showLogo: true,
    showSymbol: !front,
    showPhoto: front,
    showRole: front,
    showPlan: !front,
    showIdNumber: true,
    showValidUntil: true,
  };
  const layout = layoutForPaper(look.template, look.widthMm, look.heightMm, flags);
  if (!front) {
    // The back's note runs to two or three lines: lift it (and a symbol stacked above it) clear of the edge.
    const lineMm = layout.elementTextSizes.footer * PT_TO_MM * CARD_LINE_HEIGHT.body;
    const lift = round1(lineMm * (look.widthMm > look.heightMm ? 1 : 2));
    const at = layout.elementPositions;
    const symbolAbove = at.symbol.yMm < at.footer.yMm - 1;
    at.footer = { ...at.footer, yMm: round1(at.footer.yMm - lift) };
    if (symbolAbove) at.symbol = { ...at.symbol, yMm: round1(at.symbol.yMm - lift) };
    // The back prints no name: start the plan, number and answers where the name would be.
    const up = at.plan.yMm - at.name.yMm;
    for (const item of ["plan", "idNumber", "validUntil", "details"] as const) at[item] = { ...at[item], yMm: round1(at[item].yMm - up) };
  }
  return {
    ...defaultCardSideSettings(context),
    ...look,
    ...layout,
    heading: front ? context.organisationName : context.planName || context.organisationName,
    cardLabel: front ? "MEMBER" : "ABOUT THIS CARD",
    showCardLabel: true,
    showFooter: !front,
    footerText: front
      ? context.organisationName
      : `Issued by ${context.organisationName || "the organisation named on the front"}. Scan the QR code on the front to check this card is current.`.slice(0, 240),
    nameAutoFit: true,
    showGrid: true,
    gridSizeMm: 1,
    ...flags,
    showName: front,
    showQr: front,
    printFieldKeys: [],
    printFieldLabels: {},
    watermark: { ...DEFAULT_WATERMARK },
    layers: [],
    order: [...DEFAULT_ORDER],
  };
}

export function defaultCardDesign(context: CardDesignContext, preset: CardPreset = "community"): CardDesign {
  return { version: 1, preset, backEnabled: true, front: side(preset, "front", context), back: side(preset, "back", context) };
}

/** A fresh front and back for `preset`, keeping the watermark and printed answers already chosen. */
export function applyCardPreset(design: CardDesign, preset: CardPreset, context: CardDesignContext): CardDesign {
  const next = defaultCardDesign(context, preset);
  const keep = (fresh: CardSideSettings, old: CardSideSettings) => ({ ...fresh, watermark: old.watermark, printFieldKeys: old.printFieldKeys, printFieldLabels: old.printFieldLabels });
  return { ...next, backEnabled: design.backEnabled, front: keep(next.front, design.front), back: keep(next.back, design.back) };
}

/** The design with only `organisationId`'s own uploaded artwork. */
export function withOwnArtwork(design: CardDesign, organisationId: string): CardDesign {
  return { ...design, front: scopeCardArtwork(design.front, organisationId), back: scopeCardArtwork(design.back, organisationId) };
}

/** The card fonts a design's layers use. */
export function designFonts(design: CardDesign) {
  return [design.front, design.back].flatMap((side) => [...Object.values(side.elementFonts), ...side.layers.flatMap((layer) => (layer.kind === "text" ? [layer.font] : []))]);
}

/** Make a stored or submitted design safe to use. Anything unexpected falls back to the preset's default. */
export function normalizeCardDesign(value: unknown, context: CardDesignContext): CardDesign {
  const input = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const preset = (CARD_PRESETS as readonly string[]).includes(input.preset as string) ? (input.preset as CardPreset) : "community";
  const fallback = defaultCardDesign(context, preset);
  const sideOf = (raw: unknown, fallbackSide: CardSideSettings) => (raw && typeof raw === "object" && !Array.isArray(raw) ? normalizeCardSide(raw, context) : fallbackSide);
  return {
    version: 1,
    preset,
    backEnabled: typeof input.backEnabled === "boolean" ? input.backEnabled : true,
    front: sideOf(input.front, fallback.front),
    back: sideOf(input.back, fallback.back),
  };
}
