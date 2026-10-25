import { contrastRatio, mix, normalizeAccentHex } from "@/lib/theme/accent";

/*
 * Card colours. Managers pick from the Space Works brand colours, the
 * organisation's own accent or any colour of their own; every text colour is
 * contrast-checked (WCAG AA, 4.5:1) against what it sits on, and Workshop Orange
 * is only ever a fill, never text. Shared by the browser preview and the server
 * renderer.
 */

export const BRAND = {
  ink: "#142C2A",
  teal: "#006E63",
  orange: "#FF7447",
  citron: "#DFFF8F",
  sky: "#B5CDFF",
  yellow: "#FFD447",
  cream: "#FFF4E8",
  white: "#FFFFFF",
} as const;

/** Print-economy mode: pure black on white, which laser and thermal printers reproduce exactly. */
const MONO_INK = "#000000";

export const CARD_BACKGROUND_KEYS = ["white", "cream", "ink", "teal", "citron", "sky", "org", "custom"] as const;
export const CARD_ACCENT_KEYS = ["org", "teal", "ink", "orange", "citron", "sky", "yellow", "custom"] as const;
export const CARD_TEXT_KEYS = ["auto", "ink", "teal", "cream", "white", "custom"] as const;

/** The colours behind each "custom" choice, as #RRGGBB. */
export type CardCustomColours = { background: string; accent: string; text: string };
export const DEFAULT_CUSTOM_COLOURS: CardCustomColours = { background: "#F2EFE9", accent: "#5B3FD9", text: "#1D1D1F" };

export type CardBackgroundKey = (typeof CARD_BACKGROUND_KEYS)[number];
export type CardAccentKey = (typeof CARD_ACCENT_KEYS)[number];
export type CardTextKey = (typeof CARD_TEXT_KEYS)[number];
export type CardColorMode = "colour" | "mono";

export const CARD_COLOUR_LABELS: Record<CardBackgroundKey | CardAccentKey | CardTextKey, string> = {
  auto: "Automatic",
  white: "White",
  cream: "Warm Cream",
  ink: "Deep Ink",
  teal: "Maker Teal",
  orange: "Workshop Orange",
  citron: "Citron",
  sky: "Sky Blue",
  yellow: "Warm Yellow",
  org: "Organisation colour",
  custom: "Your own colour",
};

/** Minimum contrast for any text on the card. */
export const CARD_TEXT_CONTRAST = 4.5;

/** Which master of the Space Works symbol to place: never recoloured, only chosen. */
export type CardSymbolVariant = "full" | "reversed" | "ink";

export type CardPalette = {
  background: string;
  /** Body text: name, role, plan, answers, footer. */
  text: string;
  /** Heading and card label when they are not on the band. */
  heading: string;
  /** Band fill, frame and rules. */
  accent: string;
  /** Text on the band. */
  onAccent: string;
  /** Frame and header rule colour (the accent, unless it would vanish into the background). */
  rule: string;
  /** Tile behind the logo and the QR so they stay legible on any background. */
  tile: string;
  qrDark: string;
  qrLight: string;
  photoPlaceholder: string;
  onPhotoPlaceholder: string;
  symbol: CardSymbolVariant;
  /** True when the chosen text colour failed the contrast check and was replaced. */
  textAdjusted: boolean;
};

export function orgAccentHex(value: string | null | undefined) {
  return normalizeAccentHex(value, BRAND.teal);
}

function colourFor(key: CardBackgroundKey | CardAccentKey | Exclude<CardTextKey, "auto">, orgAccent: string, custom: string) {
  if (key === "custom") return custom;
  return key === "org" ? orgAccent : BRAND[key];
}

/** Relative luminance (sRGB), for choosing light or dark artwork. */
export function relativeLuminance(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** The first candidate that reaches `ratio` against `surface`, else the one with the most contrast. */
export function readableOn(surface: string, candidates: readonly string[], ratio = CARD_TEXT_CONTRAST) {
  const passing = candidates.find((candidate) => contrastRatio(candidate, surface) >= ratio);
  if (passing) return passing;
  return [...candidates].sort((a, b) => contrastRatio(b, surface) - contrastRatio(a, surface))[0]!;
}

/** True when `color` may be used for text on `surface`: enough contrast, and never Workshop Orange. */
export function isReadableText(color: string, surface: string) {
  return color.toUpperCase() !== BRAND.orange && contrastRatio(color, surface) >= CARD_TEXT_CONTRAST;
}

/**
 * A mid-tone organisation accent (as band or card) can be too light for cream text and too dark for
 * ink. Deepen it towards Deep Ink until cream text on it reaches 4.5:1.
 */
function bandSafe(accent: string) {
  if ([BRAND.cream, BRAND.ink].some((text) => contrastRatio(text, accent) >= CARD_TEXT_CONTRAST)) return accent;
  for (let step = 1; step <= 20; step += 1) {
    const deeper = mix(BRAND.ink, accent, step * 0.05);
    if (contrastRatio(BRAND.cream, deeper) >= CARD_TEXT_CONTRAST) return deeper;
  }
  return BRAND.ink;
}

export function resolveCardPalette(
  input: { colorMode: CardColorMode; backgroundColor: CardBackgroundKey; accentColor: CardAccentKey; textColor: CardTextKey; customColours?: CardCustomColours },
  orgAccent: string | null | undefined,
): CardPalette {
  if (input.colorMode === "mono") {
    return {
      background: BRAND.white,
      text: MONO_INK,
      heading: MONO_INK,
      accent: MONO_INK,
      onAccent: BRAND.white,
      rule: MONO_INK,
      tile: BRAND.white,
      qrDark: MONO_INK,
      qrLight: BRAND.white,
      photoPlaceholder: MONO_INK,
      onPhotoPlaceholder: BRAND.white,
      symbol: "ink",
      textAdjusted: false,
    };
  }
  const accentHex = orgAccentHex(orgAccent);
  const custom = input.customColours ?? DEFAULT_CUSTOM_COLOURS;
  // A colour of the organisation's own is used as chosen for the card; bands are still deepened for their text.
  const background = input.backgroundColor === "custom" ? custom.background : bandSafe(colourFor(input.backgroundColor, accentHex, custom.background));
  const accent = bandSafe(colourFor(input.accentColor, accentHex, custom.accent));
  const automatic = readableOn(background, [BRAND.ink, BRAND.cream, BRAND.white]);
  const chosen = input.textColor === "auto" ? automatic : colourFor(input.textColor, accentHex, custom.text);
  const textAdjusted = input.textColor !== "auto" && !isReadableText(chosen, background);
  const text = textAdjusted ? automatic : chosen;
  const onAccent = readableOn(accent, [BRAND.cream, BRAND.ink, BRAND.white]);
  const lightBackground = relativeLuminance(background) > 0.4;
  return {
    background,
    text,
    // The accent colours the heading only when it reads as text; orange never does.
    heading: isReadableText(accent, background) ? accent : text,
    accent,
    onAccent,
    rule: contrastRatio(accent, background) >= 1.5 ? accent : text,
    tile: BRAND.white,
    qrDark: BRAND.ink,
    qrLight: BRAND.white,
    photoPlaceholder: accent,
    onPhotoPlaceholder: onAccent,
    // Brand rules: one-colour ink on white, full colour on light brand colours, reversed on dark.
    symbol: background === BRAND.white ? "ink" : lightBackground ? "full" : "reversed",
    textAdjusted,
  };
}

export const SYMBOL_ASSET: Record<CardSymbolVariant, string> = {
  full: "/brand/logo/symbol.svg",
  reversed: "/brand/logo/symbol-reversed.svg",
  ink: "/brand/logo/symbol-one-colour-ink.svg",
};

/** The master symbol's aspect ratio (136 × 126). */
export const SYMBOL_ASPECT = 136 / 126;
