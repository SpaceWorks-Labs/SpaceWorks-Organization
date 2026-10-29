import { contrastRatio, getAccentTokens, normalizeAccentHex } from "@/lib/theme/accent";

/** Page canvases in each mode (app/styles/tokens.css). */
const CANVAS = { light: "#FFF4E8", dark: "#142C2A" } as const;

/** WCAG 2.2: 4.5:1 for text, 3:1 for buttons and other controls against what surrounds them. */
const TEXT_RATIO = 4.5;
const CONTROL_RATIO = 3;

type AccentCheck = {
  accent: string;
  /** Button label on the accent fill (the label colour is picked automatically). */
  label: number;
  /** The accent fill against the page, light and dark. */
  light: number;
  dark: number;
  /**
   * fail: the button label can't reach 4.5:1. warn: the fill reaches less than 3:1 against the light page,
   * so buttons and highlights fade (text in the accent is darkened automatically). pass otherwise.
   */
  level: "pass" | "warn" | "fail";
};

const round = (value: number) => Math.round(value * 10) / 10;

/** How an accent colour reads on the public page. Text colours are adjusted for AA automatically. */
export function checkAccentContrast(value: string): AccentCheck {
  const accent = normalizeAccentHex(value);
  const tokens = getAccentTokens(accent, "light");
  const label = contrastRatio(accent, tokens["--sw-on-accent"]);
  const light = contrastRatio(accent, CANVAS.light);
  const dark = contrastRatio(accent, CANVAS.dark);
  const level = label < TEXT_RATIO ? "fail" : light < CONTROL_RATIO ? "warn" : "pass";
  return { accent, label: round(label), light: round(light), dark: round(dark), level };
}
