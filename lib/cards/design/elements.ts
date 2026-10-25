import type { CardAccentKey, CardBackgroundKey, CardColorMode, CardCustomColours, CardTextKey } from "@/lib/cards/palette";
import type { CardBackground, CardLayer } from "./layers";

/*
 * One side of a member card: what prints, where (millimetres from the top-left corner), how big and
 * in which colours. Shared by the browser canvas, the PDF/PNG renderer and the designer. Ported from
 * the Space Works Events badge engine (lib/idCardPrint.ts), without the event-only items.
 */

export const CARD_ELEMENTS = [
  "header", "name", "role", "plan", "details", "qr", "footer", "logo", "symbol", "photo", "idNumber", "validUntil",
] as const;

export type CardElement = (typeof CARD_ELEMENTS)[number];
export type CardElementPosition = { xMm: number; yMm: number };
export type CardElementPositions = Record<CardElement, CardElementPosition>;
export type CardElementSizes = Record<CardElement, number>;
export type CardElementBold = Record<CardElement, boolean>;
export type CardElementTextSizes = Record<CardElement, number>;
export const CARD_GRID_SIZES_MM = [1, 2, 5, 10] as const;
export type CardGridSizeMm = (typeof CARD_GRID_SIZES_MM)[number];

/** Square items: their size is both width and height. */
const SQUARE_ELEMENTS: ReadonlySet<CardElement> = new Set(["qr", "logo", "symbol", "photo"]);

export function isSquareElement(element: CardElement) {
  return SQUARE_ELEMENTS.has(element);
}

export type CardTextElement = "header" | "name" | "role" | "plan" | "details" | "footer" | "idNumber" | "validUntil";

export function isTextElement(element: CardElement): element is CardTextElement {
  return !SQUARE_ELEMENTS.has(element);
}

/** Smallest size per item, in millimetres. */
export function minimumElementSizeMm(element: CardElement) {
  if (element === "symbol") return 7;
  if (element === "photo") return 8;
  if (SQUARE_ELEMENTS.has(element)) return 10;
  return 20;
}

export const WATERMARK_KINDS = ["none", "text", "image"] as const;
export const WATERMARK_COLOURS = ["accent", "text"] as const;
export const WATERMARK_OPACITY_MIN = 4;
export const WATERMARK_OPACITY_MAX = 30;

/** A faint mark behind everything: a short rotated word or an uploaded image, at low opacity. */
export type CardWatermark = {
  kind: (typeof WATERMARK_KINDS)[number];
  text: string;
  /** Percent, 4–30. */
  opacityPct: number;
  colour: (typeof WATERMARK_COLOURS)[number];
  /** Rotation for text watermarks, in degrees (clockwise). */
  angleDeg: number;
};

export const DEFAULT_WATERMARK: CardWatermark = { kind: "none", text: "", opacityPct: 10, colour: "accent", angleDeg: -30 };

export type CardTemplate = "classic" | "bold" | "minimal";

export type CardSideSettings = {
  widthMm: number;
  heightMm: number;
  heading: string;
  cardLabel: string;
  template: CardTemplate;
  footerText: string;
  /** The organisation logo (layout item `logo`). */
  showLogo: boolean;
  /** Plan field keys printed in the details block, in order. */
  printFieldKeys: string[];
  /** Optional per-card labels; keys correspond to `printFieldKeys`. */
  printFieldLabels: Record<string, string>;
  elementPositions: CardElementPositions;
  /** Width in millimetres for text items; square size for graphics. */
  elementSizes: CardElementSizes;
  elementBold: CardElementBold;
  /** Point size for each text item; graphic entries are unused. */
  elementTextSizes: CardElementTextSizes;
  /** Card font ids for text items set to something other than the default face. */
  elementFonts: Partial<Record<CardTextElement, string>>;
  gridSizeMm: CardGridSizeMm;
  showGrid: boolean;
  /** Shrink long names (down to 60%) so they stay on one line. */
  nameAutoFit: boolean;
  showCardLabel: boolean;
  showFooter: boolean;
  /** "mono" is the print-economy mode: black on white only. */
  colorMode: CardColorMode;
  backgroundColor: CardBackgroundKey;
  /** Band, frame and rules. */
  accentColor: CardAccentKey;
  textColor: CardTextKey;
  /** The Space Works symbol. */
  showSymbol: boolean;
  showPhoto: boolean;
  photoShape: "circle" | "rounded";
  showName: boolean;
  /** The member's primary role ("Secretary"). */
  showRole: boolean;
  /** The plan the card belongs to ("Life member"). */
  showPlan: boolean;
  /** The verify QR code. */
  showQr: boolean;
  /** The printed card number. */
  showIdNumber: boolean;
  idNumberLabel: string;
  showValidUntil: boolean;
  validUntilLabel: string;
  watermark: CardWatermark;
  /** The colours behind the "custom" background, accent and text choices. */
  customColours: CardCustomColours;
  /** Background artwork under everything, watermark included. */
  background: CardBackground;
  /** The side's own text, images and shapes (lib/cards/design/layers.ts). */
  layers: CardLayer[];
  /** Built-in items and layer ids, bottom first. */
  order: string[];
};

/** The optional items whose presence changes the default layout. */
export type CardLayoutFlags = Pick<CardSideSettings, "showLogo" | "showSymbol" | "showPhoto">
  & Partial<Pick<CardSideSettings, "showRole" | "showPlan" | "showIdNumber" | "showValidUntil">>;

export const DEFAULT_LAYOUT_FLAGS: CardLayoutFlags = { showLogo: true, showSymbol: true, showPhoto: false };

export function layoutFlags(settings: CardLayoutFlags): CardLayoutFlags {
  return {
    showLogo: settings.showLogo,
    showSymbol: settings.showSymbol,
    showPhoto: settings.showPhoto,
    ...(settings.showRole ? { showRole: true } : {}),
    ...(settings.showPlan ? { showPlan: true } : {}),
    ...(settings.showIdNumber ? { showIdNumber: true } : {}),
    ...(settings.showValidUntil ? { showValidUntil: true } : {}),
  };
}

/** ISO/IEC 7810 ID-1, the size of a bank card. */
export const CR80 = { widthMm: 85.6, heightMm: 53.98 };
export const A6_PORTRAIT = { widthMm: 105, heightMm: 148 };

/** Millimetres per typographic point. */
export const PT_TO_MM = 0.3528;

/** Line heights shared by the preview and the renderer. */
export const CARD_LINE_HEIGHT = { label: 1.2, heading: 1.1, name: 1.1, body: 1.25 } as const;

/** White padding around the QR code and logo tiles. */
export const TILE_PADDING_MM = 1;
/** Space between rows of answers, and between label and answer. */
export const DETAILS_ROW_GAP_MM = 1.5;
export const DETAILS_COLUMN_GAP_MM = 4;
/** Card backs carry a longer note than fronts. */
export const FOOTER_MAX_LENGTH = 240;

export const round1 = (value: number) => Math.round(value * 10) / 10;
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The small label above the heading scales with it: about half the heading size, 5.5–9pt. */
export function cardLabelPt(headerPt: number) {
  return Math.min(9, Math.max(5.5, Math.round(headerPt * 0.5 * 2) / 2));
}

/** Layout scale relative to A6 (1 on A6), so small stock gets proportionally smaller text and margins. */
export function paperScale(widthMm: number, heightMm: number) {
  return Math.min(1.6, Math.max(0.45, Math.min(widthMm, heightMm) / 105));
}

const INDIC = /[ऀ-෿]/;

/**
 * Estimated width of `text` in ems: an average per user-perceived character, wider for Indic
 * letters (a conjunct is one character but a wide one). Close enough for names; the server
 * renderer measures the shaped text and shrinks further if a name still overflows.
 */
export function estimateEmWidth(text: string, bold: boolean) {
  let ems = 0;
  for (const { segment } of new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text.trim())) {
    ems += INDIC.test(segment) ? 0.95 : bold ? 0.6 : 0.54;
  }
  return Math.max(0.6, ems);
}

/**
 * Point size that keeps `text` on one line within `widthMm`, never above `sizePt` and never below
 * `minRatio` of it (then it wraps instead).
 */
export function fitTextSizePt(text: string, widthMm: number, sizePt: number, bold: boolean, minRatio = 0.6) {
  const fitting = widthMm / (estimateEmWidth(text, bold) * PT_TO_MM);
  return round1(Math.max(sizePt * minRatio, Math.min(sizePt, fitting)));
}

/**
 * The fixed, non-draggable look of each template, shared by the on-screen card and the server
 * renderer so both draw the same rules, frame and band. Colours come from the palette.
 */
export type CardTemplateDecor = {
  frame: { insetMm: number; ruleMm: number; radiusMm: number } | null;
  headerRule: { gapMm: number; ruleMm: number } | null;
  band: { padXMm: number; padYMm: number; radiusMm: number } | null;
  labelGapMm: number;
  nameTrackingEm: number;
  nameUppercase: boolean;
};

export const marginMm = (k: number) => Math.max(3, round1(10 * k));
export const bandInsetMm = (k: number) => Math.max(4, round1(5 * k));

export function cardTemplateDecor(template: CardTemplate, widthMm: number, heightMm: number): CardTemplateDecor {
  const k = paperScale(widthMm, heightMm);
  const labelGapMm = Math.max(1, round1(2 * k));
  if (template === "bold") {
    return {
      frame: null,
      headerRule: null,
      band: { padXMm: Math.max(2, round1(marginMm(k) - bandInsetMm(k))), padYMm: Math.max(2, round1(4.5 * k)), radiusMm: Math.max(1, round1(2 * k)) },
      labelGapMm,
      nameTrackingEm: 0,
      nameUppercase: true,
    };
  }
  if (template === "minimal") return { frame: null, headerRule: null, band: null, labelGapMm, nameTrackingEm: -0.02, nameUppercase: false };
  return {
    frame: { insetMm: Math.max(2.5, round1(5 * k)), ruleMm: 0.3, radiusMm: Math.max(1, round1(2.5 * k)) },
    headerRule: { gapMm: Math.max(1.5, round1(3 * k)), ruleMm: 0.25 },
    band: null,
    labelGapMm,
    nameTrackingEm: -0.02,
    nameUppercase: false,
  };
}

/**
 * The name's point size after auto-fit. The bold template prints names in capitals, which run about
 * 15% wider, so it fits them in a slightly narrower measure. A name too long for two lines at the
 * floor keeps shrinking until it fits the room kept for it (1.2 lines at full size).
 */
export function nameSizePt(settings: CardSideSettings, name: string) {
  const size = settings.elementTextSizes.name;
  if (!settings.nameAutoFit) return size;
  const uppercase = cardTemplateDecor(settings.template, settings.widthMm, settings.heightMm).nameUppercase;
  const widthMm = uppercase ? settings.elementSizes.name / 1.15 : settings.elementSizes.name;
  const bold = settings.elementBold.name || uppercase;
  const fitted = fitTextSizePt(name, widthMm, size, bold);
  // Lines ≈ ems·pt/width and lines·pt must stay within 1.2·size, so pt ≤ √(1.2·size·width / ems);
  // 0.85 leaves room for words that wrap early.
  const area = 0.85 * Math.sqrt((1.2 * size * widthMm) / (estimateEmWidth(name, bold) * PT_TO_MM));
  return round1(Math.min(fitted, Math.max(size * 0.3, area)));
}

/** Estimated height of the heading block (label, one line of heading, rule or band padding). */
export function estimateHeaderHeightMm(template: CardTemplate, headerPt: number, widthMm: number, heightMm: number) {
  const decor = cardTemplateDecor(template, widthMm, heightMm);
  let height = cardLabelPt(headerPt) * PT_TO_MM * CARD_LINE_HEIGHT.label + decor.labelGapMm + headerPt * PT_TO_MM * CARD_LINE_HEIGHT.heading;
  if (decor.headerRule) height += decor.headerRule.gapMm + decor.headerRule.ruleMm;
  if (decor.band) height += decor.band.padYMm * 2;
  return round1(height);
}

/** Room kept for the name: one line at full size, or two lines once auto-fit has shrunk it. */
export function nameBlockHeightMm(namePt: number) {
  return round1(namePt * PT_TO_MM * CARD_LINE_HEIGHT.name * 1.2);
}

/** Clear space kept around the Space Works symbol: a quarter of its height, rounded up. */
export function symbolClearSpaceMm(symbolSizeMm: number) {
  return Math.ceil(symbolSizeMm * 2.5) / 10;
}

/** Height an item occupies for keeping it on the card (text items only need their top on the card). */
export function elementBoxHeightMm(element: CardElement, sizes: CardElementSizes) {
  return SQUARE_ELEMENTS.has(element) ? sizes[element] : 0;
}

/** Point size for a text watermark: about three quarters of the diagonal, never over 40% of the short side. */
export function watermarkSizePt(text: string, widthMm: number, heightMm: number, angleDeg: number) {
  const chars = Math.max(1, [...text.trim()].length);
  const span = angleDeg === 0 ? widthMm : Math.hypot(widthMm, heightMm) * 0.85;
  const fitting = (span * 0.75) / (chars * 0.62 * PT_TO_MM);
  const tallest = (Math.min(widthMm, heightMm) * 0.4) / PT_TO_MM;
  return round1(Math.max(6, Math.min(fitting, tallest)));
}
