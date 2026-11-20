import { resolveCardPalette } from "@/lib/cards/palette";
import { CR80, DEFAULT_WATERMARK, type CardLayoutFlags, type CardSideSettings } from "./elements";
import { layoutForPaper } from "./geometry";
import { DEFAULT_ORDER, scopeCardArtwork } from "./layers";
import { defaultCardSideSettings, normalizeCardSide, type CardDesignContext } from "./normalize";
import { backNote, standardBack, unitsLine } from "./sides";

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
export const LANDSCAPE = { widthMm: round1(CR80.widthMm), heightMm: round1(CR80.heightMm) };
export const PORTRAIT = { widthMm: round1(CR80.heightMm), heightMm: round1(CR80.widthMm) };

export type PresetLook = Pick<CardSideSettings, "template" | "backgroundColor" | "accentColor" | "textColor" | "widthMm" | "heightMm" | "photoShape">;

export const LOOKS: Record<CardPreset, PresetLook> = {
  community: { template: "classic", backgroundColor: "cream", accentColor: "teal", textColor: "auto", photoShape: "rounded", ...LANDSCAPE },
  corporate: { template: "bold", backgroundColor: "white", accentColor: "ink", textColor: "auto", photoShape: "circle", ...PORTRAIT },
  night: { template: "bold", backgroundColor: "ink", accentColor: "citron", textColor: "auto", photoShape: "rounded", ...PORTRAIT },
  student: { template: "bold", backgroundColor: "white", accentColor: "sky", textColor: "auto", photoShape: "rounded", ...LANDSCAPE },
};

/**
 * One side of a built-in design in `look`. `units` adds the member's units under the role on the front
 * (templates do; presets keep the plain default layout, so turning items on and off still reflows it).
 */
export function lookSide(look: PresetLook, which: CardSide, context: CardDesignContext, options: { units?: boolean } = {}): CardSideSettings {
  const front = which === "front";
  const flags: Required<CardLayoutFlags> = {
    showLogo: true,
    showSymbol: !front,
    showPhoto: front,
    showRole: front,
    showPlan: true,
    showIdNumber: true,
    showValidUntil: true,
    showQrCaption: front,
  };
  const layout = layoutForPaper(look.template, look.widthMm, look.heightMm, flags);
  const note = backNote(context.organisationName);
  const ink = resolveCardPalette({ colorMode: "colour", ...look }, null).text;
  const layers = !front ? standardBack(layout, look.widthMm, look.heightMm, note, ink, "lback") : options.units ? [unitsLine(layout, look.widthMm, look.heightMm, ink, "lunits")] : [];
  // Normalised like a saved side, so the back's layers are complete.
  return normalizeCardSide({
    ...defaultCardSideSettings(context),
    ...look,
    ...layout,
    heading: context.organisationName,
    cardLabel: front ? "MEMBER" : "ABOUT THIS CARD",
    showCardLabel: true,
    showFooter: !front,
    footerText: front ? context.organisationName : note,
    nameAutoFit: true,
    showGrid: true,
    gridSizeMm: 1,
    ...flags,
    showName: front,
    showQr: front,
    printFieldKeys: [],
    printFieldLabels: {},
    watermark: { ...DEFAULT_WATERMARK },
    layers,
    order: [...DEFAULT_ORDER, ...layers.map((layer) => layer.id)],
  }, context);
}

export function defaultCardDesign(context: CardDesignContext, preset: CardPreset = "community"): CardDesign {
  return { version: 1, preset, backEnabled: true, front: lookSide(LOOKS[preset], "front", context), back: lookSide(LOOKS[preset], "back", context) };
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
