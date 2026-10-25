import { CARD_ACCENT_KEYS, CARD_BACKGROUND_KEYS, CARD_TEXT_KEYS, DEFAULT_CUSTOM_COLOURS, type CardCustomColours } from "@/lib/cards/palette";
import {
  CARD_ELEMENTS,
  CARD_GRID_SIZES_MM,
  clamp,
  CR80,
  DEFAULT_LAYOUT_FLAGS,
  DEFAULT_WATERMARK,
  elementBoxHeightMm,
  FOOTER_MAX_LENGTH,
  isTextElement,
  minimumElementSizeMm,
  WATERMARK_COLOURS,
  WATERMARK_KINDS,
  WATERMARK_OPACITY_MAX,
  WATERMARK_OPACITY_MIN,
  type CardElement,
  type CardElementPosition,
  type CardElementPositions,
  type CardElementSizes,
  type CardGridSizeMm,
  type CardLayoutFlags,
  type CardSideSettings,
  type CardWatermark,
} from "./elements";
import { defaultElementBold, defaultElementTextSizes, geometryWithOptionalDefaults, layoutForPaper } from "./geometry";
import { DEFAULT_BACKGROUND, DEFAULT_ORDER, hexColour, normalizeBackground, normalizeLayers, normalizeOrder } from "./layers";

/*
 * Saved and submitted designs are never trusted: every value is bounded, and anything unexpected is
 * replaced by a default, so a design always renders.
 */

export type CardDesignContext = { organisationName: string; planName: string };

const MIN_DIMENSION_MM = 40;
const MAX_DIMENSION_MM = 300;

export const TEXT_LIMITS = [["heading", 120], ["cardLabel", 40], ["footerText", FOOTER_MAX_LENGTH], ["idNumberLabel", 30], ["validUntilLabel", 30]] as const;

function boundedDimension(value: unknown, fallback: number) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(MAX_DIMENSION_MM, Math.max(MIN_DIMENSION_MM, Math.round(numberValue * 10) / 10));
}

function boundedText(value: unknown, fallback: string, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : fallback;
}

function fieldKeys(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item, index, all) => /^[a-z0-9_]{1,64}$/.test(item) && all.indexOf(item) === index)
    .slice(0, 12);
}

function fieldLabels(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, label]) => /^[a-z0-9_]{1,64}$/.test(key) && typeof label === "string")
      .map(([key, label]) => [key, (label as string).trim().slice(0, 60)])
      .slice(0, 12),
  );
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<Record<CardElement, unknown>>) : {};
}

function boundedPosition(value: unknown, fallback: CardElementPosition, widthMm: number, heightMm: number) {
  if (!value || typeof value !== "object") return fallback;
  const input = value as Partial<CardElementPosition>;
  const x = Number(input.xMm);
  const y = Number(input.yMm);
  return {
    xMm: Number.isFinite(x) ? Math.min(widthMm - 4, Math.max(0, Math.round(x * 10) / 10)) : fallback.xMm,
    yMm: Number.isFinite(y) ? Math.min(heightMm - 4, Math.max(0, Math.round(y * 10) / 10)) : fallback.yMm,
  };
}

function elementSizes(value: unknown, fallback: CardElementSizes, widthMm: number) {
  const input = asRecord(value);
  return Object.fromEntries(CARD_ELEMENTS.map((element) => {
    const size = Number(input[element]);
    const minimum = minimumElementSizeMm(element);
    const maximum = Math.max(minimum, widthMm - 4);
    return [element, Number.isFinite(size) ? Math.min(maximum, Math.max(minimum, Math.round(size * 10) / 10)) : fallback[element]];
  })) as CardElementSizes;
}

/** Keep every item on the card: graphics wholly, text by its top-left corner. */
function fitPositions(value: unknown, fallback: CardElementPositions, sizes: CardElementSizes, widthMm: number, heightMm: number) {
  const input = asRecord(value);
  return Object.fromEntries(CARD_ELEMENTS.map((element) => {
    const at = boundedPosition(input[element], fallback[element], widthMm, heightMm);
    const boxHeight = elementBoxHeightMm(element, sizes);
    return [element, {
      xMm: Math.min(Math.max(0, widthMm - sizes[element] - 4), at.xMm),
      yMm: boxHeight > 0 ? Math.min(Math.max(0, heightMm - boxHeight - 4), at.yMm) : at.yMm,
    }];
  })) as CardElementPositions;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

function watermark(value: unknown): CardWatermark {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_WATERMARK };
  const input = value as Partial<Record<keyof CardWatermark, unknown>>;
  const opacity = Number(input.opacityPct);
  const angle = Number(input.angleDeg);
  return {
    kind: oneOf(input.kind, WATERMARK_KINDS, DEFAULT_WATERMARK.kind),
    text: typeof input.text === "string" ? input.text.trim().slice(0, 32) : "",
    opacityPct: Number.isFinite(opacity) ? clamp(Math.round(opacity), WATERMARK_OPACITY_MIN, WATERMARK_OPACITY_MAX) : DEFAULT_WATERMARK.opacityPct,
    colour: oneOf(input.colour, WATERMARK_COLOURS, DEFAULT_WATERMARK.colour),
    angleDeg: Number.isFinite(angle) ? clamp(Math.round(angle), -90, 90) : DEFAULT_WATERMARK.angleDeg,
  };
}

function customColours(value: unknown): CardCustomColours {
  const input = value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<Record<keyof CardCustomColours, unknown>>) : {};
  return {
    background: hexColour(input.background) ?? DEFAULT_CUSTOM_COLOURS.background,
    accent: hexColour(input.accent) ?? DEFAULT_CUSTOM_COLOURS.accent,
    text: hexColour(input.text) ?? DEFAULT_CUSTOM_COLOURS.text,
  };
}

export function defaultCardSideSettings(context: CardDesignContext): CardSideSettings {
  const size = { widthMm: CR80.widthMm, heightMm: CR80.heightMm };
  return {
    ...size,
    heading: context.organisationName.trim().slice(0, 120),
    cardLabel: "MEMBER",
    template: "classic",
    footerText: context.organisationName.trim().slice(0, 80),
    printFieldKeys: [],
    printFieldLabels: {},
    ...layoutForPaper("classic", size.widthMm, size.heightMm),
    gridSizeMm: 1,
    showGrid: true,
    nameAutoFit: true,
    showCardLabel: true,
    showFooter: true,
    colorMode: "colour",
    backgroundColor: "white",
    accentColor: "org",
    textColor: "auto",
    ...DEFAULT_LAYOUT_FLAGS,
    photoShape: "circle",
    showName: true,
    showRole: false,
    showPlan: false,
    showQr: true,
    showIdNumber: false,
    idNumberLabel: "No.",
    showValidUntil: false,
    validUntilLabel: "Valid until",
    watermark: { ...DEFAULT_WATERMARK },
    customColours: { ...DEFAULT_CUSTOM_COLOURS },
    background: { ...DEFAULT_BACKGROUND },
    layers: [],
    order: [...DEFAULT_ORDER],
  };
}

/** Make one stored or submitted side safe to use. */
export function normalizeCardSide(value: unknown, context: CardDesignContext): CardSideSettings {
  const fallback = defaultCardSideSettings(context);
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const input = value as Partial<Record<keyof CardSideSettings, unknown>>;
  const widthMm = boundedDimension(input.widthMm, fallback.widthMm);
  const heightMm = boundedDimension(input.heightMm, fallback.heightMm);
  const template = oneOf(input.template, ["classic", "bold", "minimal"] as const, fallback.template);
  const flags: Required<CardLayoutFlags> = {
    showLogo: bool(input.showLogo, fallback.showLogo),
    showSymbol: bool(input.showSymbol, fallback.showSymbol),
    showPhoto: bool(input.showPhoto, fallback.showPhoto),
    showRole: bool(input.showRole, fallback.showRole),
    showPlan: bool(input.showPlan, fallback.showPlan),
    showIdNumber: bool(input.showIdNumber, fallback.showIdNumber),
    showValidUntil: bool(input.showValidUntil, fallback.showValidUntil),
  };
  const defaults = geometryWithOptionalDefaults(template, widthMm, heightMm, flags);
  const sizes = elementSizes(input.elementSizes, defaults.sizes, widthMm);
  const textSizes = asRecord(input.elementTextSizes);
  const textFallback = defaultElementTextSizes(template, widthMm, heightMm);
  const boldInput = asRecord(input.elementBold);
  const boldFallback = defaultElementBold();
  const grid = Number(input.gridSizeMm);
  const layers = normalizeLayers(input.layers, { widthMm, heightMm });
  return {
    widthMm,
    heightMm,
    heading: boundedText(input.heading, fallback.heading, 120),
    cardLabel: boundedText(input.cardLabel, fallback.cardLabel, 40),
    template,
    footerText: boundedText(input.footerText, fallback.footerText, FOOTER_MAX_LENGTH),
    printFieldKeys: fieldKeys(input.printFieldKeys),
    printFieldLabels: fieldLabels(input.printFieldLabels),
    elementPositions: fitPositions(input.elementPositions, defaults.positions, sizes, widthMm, heightMm),
    elementSizes: sizes,
    elementBold: Object.fromEntries(CARD_ELEMENTS.map((element) => [element, isTextElement(element) && typeof boldInput[element] === "boolean" ? boldInput[element] : boldFallback[element]])) as CardSideSettings["elementBold"],
    elementTextSizes: Object.fromEntries(CARD_ELEMENTS.map((element) => {
      if (!isTextElement(element)) return [element, 0];
      const size = Number(textSizes[element]);
      return [element, Number.isFinite(size) ? Math.min(48, Math.max(6, Math.round(size * 10) / 10)) : textFallback[element]];
    })) as CardSideSettings["elementTextSizes"],
    gridSizeMm: (CARD_GRID_SIZES_MM.find((option) => option === grid) ?? fallback.gridSizeMm) as CardGridSizeMm,
    showGrid: bool(input.showGrid, fallback.showGrid),
    nameAutoFit: bool(input.nameAutoFit, fallback.nameAutoFit),
    showCardLabel: bool(input.showCardLabel, fallback.showCardLabel),
    showFooter: bool(input.showFooter, fallback.showFooter),
    colorMode: oneOf(input.colorMode, ["colour", "mono"] as const, fallback.colorMode),
    backgroundColor: oneOf(input.backgroundColor, CARD_BACKGROUND_KEYS, fallback.backgroundColor),
    accentColor: oneOf(input.accentColor, CARD_ACCENT_KEYS, fallback.accentColor),
    textColor: oneOf(input.textColor, CARD_TEXT_KEYS, fallback.textColor),
    ...flags,
    photoShape: oneOf(input.photoShape, ["circle", "rounded"] as const, fallback.photoShape),
    showName: bool(input.showName, fallback.showName),
    showQr: bool(input.showQr, fallback.showQr),
    idNumberLabel: boundedText(input.idNumberLabel, fallback.idNumberLabel, 30),
    validUntilLabel: boundedText(input.validUntilLabel, fallback.validUntilLabel, 30),
    watermark: watermark(input.watermark),
    customColours: customColours(input.customColours),
    background: normalizeBackground(input.background),
    layers,
    order: normalizeOrder(input.order, layers),
  };
}
