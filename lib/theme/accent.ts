/**
 * Organisation accent tokens (docs/DESIGN.md).
 *
 * Organisations can pick any colour, so every derived value is contrast-checked.
 * The output is a plain record of CSS custom properties that callers place in
 * an inline `style` on a public page root (with the `sw-accent-scope` class). Only a validated `#RRGGBB` value
 * ever reaches CSS; anything else falls back to the default accent.
 *
 * Surfaces and labels are the Space Works neutrals (app/styles/tokens.css),
 * so the default Maker Teal reproduces the global accent tokens exactly.
 */

export const DEFAULT_ORG_ACCENT = "#006E63"; // Maker Teal
export const INK_ACCENT = "#142C2A"; // Deep Ink

/**
 * Brand presets offered to organisations. The `name` values are stable keys
 * (components map them to swatch artwork); the colours are Space Works brand
 * colours. Light accents automatically get Deep Ink labels.
 */
export const ACCENT_PRESETS = [
  { name: "Teal", hex: "#006E63" },
  { name: "Ember", hex: "#FF7447" },
  { name: "Iris", hex: "#B5CDFF" },
  { name: "Ink", hex: "#142C2A" },
] as const;

/** Page and panel surfaces per mode: an accent text colour must read on all of them. */
const LIGHT_SURFACES = ["#FFF4E8", "#FFFFFF", "#F6ECE0"];
const DARK_SURFACES = ["#142C2A", "#1F433F", "#193935"];
const LIGHT_PANEL = "#FFFFFF";
const DARK_PANEL = "#1F433F";
const INK = "#142C2A";
const CREAM = "#FFF4E8";
const HEX = /^#([0-9a-f]{6})$/i;

type Rgb = [number, number, number];

export function normalizeAccentHex(value: string | null | undefined, fallback = DEFAULT_ORG_ACCENT): string {
  const trimmed = value?.trim() ?? "";
  if (HEX.test(trimmed)) return trimmed.toUpperCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toUpperCase();
  return fallback;
}

function toRgb(hex: string): Rgb {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((channel) => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function luminance(hex: string): number {
  const channels = toRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** sRGB colour-mix: `weight` of `a` mixed into `b`. */
export function mix(a: string, b: string, weight: number): string {
  const [ra, ga, ba] = toRgb(a);
  const [rb, gb, bb] = toRgb(b);
  return toHex([ra * weight + rb * (1 - weight), ga * weight + gb * (1 - weight), ba * weight + bb * (1 - weight)]);
}

/** Move `color` towards `target` until it reaches `ratio` against every surface, in small steps. */
function adjustUntil(color: string, target: string, surfaces: string[], ratio: number): string {
  let current = color;
  for (let step = 0; step <= 20; step += 1) {
    if (surfaces.every((surface) => contrastRatio(current, surface) >= ratio)) return current;
    current = mix(target, color, Math.min(1, (step + 1) * 0.05));
  }
  return target;
}

type AccentScheme = "light" | "dark";

type AccentTokens = {
  "--sw-accent": string;
  "--sw-accent-soft": string;
  "--sw-on-accent": string;
  "--sw-accent-text": string;
};

/**
 * Label candidates in brand order: cream, then Deep Ink (light accents such as
 * Workshop Orange), then white and black as a functional fallback for
 * organisation-chosen mid-tones where neither brand neutral reaches AA.
 */
const LABELS = [CREAM, INK, "#FFFFFF", "#000000"];

function labelFor(accent: string): string {
  return LABELS.find((label) => contrastRatio(accent, label) >= 4.5)
    ?? LABELS.reduce((best, label) => (contrastRatio(accent, label) > contrastRatio(accent, best) ? label : best));
}

export function getAccentTokens(value: string | null | undefined, scheme: AccentScheme, fallback = DEFAULT_ORG_ACCENT): AccentTokens {
  const accent = normalizeAccentHex(value, fallback);
  const dark = scheme === "dark";
  // Soft fill: the panel with a little of the accent (12 % light, 16 % dark).
  const soft = mix(accent, dark ? DARK_PANEL : LIGHT_PANEL, dark ? 0.16 : 0.12);
  const surfaces = [...(dark ? DARK_SURFACES : LIGHT_SURFACES), soft];
  const onAccent = labelFor(accent);
  // Text: the accent itself in light mode (darkened toward Deep Ink if needed);
  // in dark mode a third of the accent mixed into cream, lightened if needed.
  const accentText = dark
    ? adjustUntil(mix(accent, CREAM, 0.33), CREAM, surfaces, 4.5)
    : adjustUntil(accent, INK, surfaces, 4.5);
  return {
    "--sw-accent": accent,
    "--sw-accent-soft": soft,
    "--sw-on-accent": onAccent,
    "--sw-accent-text": accentText,
  };
}

/**
 * Inline style for a public page root. Light values apply directly; dark
 * values are exposed as `--sw-accent-*-dark` and swapped in by the
 * `.sw-accent-scope` rule in globals.css when dark mode is active.
 */
export function accentStyle(value: string | null | undefined, fallback = DEFAULT_ORG_ACCENT): Record<string, string> {
  const light = getAccentTokens(value, "light", fallback);
  const dark = getAccentTokens(value, "dark", fallback);
  return {
    "--sw-accent-light": light["--sw-accent"],
    "--sw-accent-soft-light": light["--sw-accent-soft"],
    "--sw-on-accent-light": light["--sw-on-accent"],
    "--sw-accent-text-light": light["--sw-accent-text"],
    "--sw-accent-dark": dark["--sw-accent"],
    "--sw-accent-soft-dark": dark["--sw-accent-soft"],
    "--sw-on-accent-dark": dark["--sw-on-accent"],
    "--sw-accent-text-dark": dark["--sw-accent-text"],
  };
}
