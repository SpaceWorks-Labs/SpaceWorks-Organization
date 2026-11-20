import { contrastRatio } from "@/lib/theme/accent";
import { CARD_FONTS, DEFAULT_CARD_FONT } from "@/lib/cards/fontCatalog";

/*
 * What the logo maker draws: initials (1–4 characters) or a short name (up to 12), in one of five shapes, two
 * colours, a card font and an optional icon from the card icon set. Validated strictly on the server before
 * anything is drawn; the browser uses the same check to explain what is wrong.
 */

export const LOGO_SHAPES = ["circle", "rounded", "hexagon", "shield", "badge"] as const;
export type LogoShape = (typeof LOGO_SHAPES)[number];

export const LOGO_SHAPE_LABELS: Record<LogoShape, string> = {
  circle: "Circle",
  rounded: "Rounded square",
  hexagon: "Hexagon",
  shield: "Shield",
  badge: "Badge",
};

export type LogoSpec = {
  text: string;
  shape: LogoShape;
  background: string;
  foreground: string;
  font: string;
  icon: string | null;
};

export const LOGO_TEXT_MAX = 12;
/** Large text needs 3:1 (WCAG AA); a logo is large text. */
export const LOGO_MIN_CONTRAST = 3;

export const DEFAULT_LOGO_SPEC: LogoSpec = { text: "", shape: "circle", background: "#006E63", foreground: "#FFFFFF", font: DEFAULT_CARD_FONT, icon: null };

const HEX = /^#[0-9A-F]{6}$/;
const FONT_IDS = new Set(CARD_FONTS.map((font) => font.id));
/** Letters (any script, with their marks), digits, spaces and a little punctuation. */
const TEXT = /^[\p{L}\p{M}\p{N} &.'’-]+$/u;
const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

/** Characters as a person counts them (grapheme clusters). */
export function logoTextLength(text: string) {
  return [...segmenter.segment(text)].length;
}

/** Initials from a name: "Kerala Makers Guild" → "KMG" (four at most). */
export function initialsFrom(name: string) {
  const words = name.normalize("NFC").split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word));
  return words.slice(0, 4).map((word) => [...segmenter.segment(word.replace(/^[^\p{L}\p{N}]+/u, ""))][0]?.segment.toLocaleUpperCase("en-GB") ?? "").join("");
}

type Result = { ok: true; spec: LogoSpec } | { ok: false; error: string };

/** A valid spec, or the first thing wrong with it. `iconIds` are the icons the maker offers. */
export function validateLogoSpec(input: unknown, iconIds: ReadonlySet<string>): Result {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Invalid request." };
  const raw = input as Record<string, unknown>;
  const text = typeof raw.text === "string" ? raw.text.normalize("NFC").replace(/\s+/g, " ").trim() : null;
  if (text === null) return { ok: false, error: "Invalid request." };
  const icon = raw.icon === null || raw.icon === undefined || raw.icon === "" ? null : raw.icon;
  if (icon !== null && (typeof icon !== "string" || !iconIds.has(icon))) return { ok: false, error: "Choose an icon from the list." };
  if (!text && !icon) return { ok: false, error: "Type initials or a short name, or choose an icon." };
  if (text && (logoTextLength(text) > LOGO_TEXT_MAX || !TEXT.test(text))) return { ok: false, error: `Use up to ${LOGO_TEXT_MAX} letters, digits or spaces.` };
  if (typeof raw.shape !== "string" || !(LOGO_SHAPES as readonly string[]).includes(raw.shape)) return { ok: false, error: "Choose a shape." };
  const background = typeof raw.background === "string" ? raw.background.toUpperCase() : "";
  const foreground = typeof raw.foreground === "string" ? raw.foreground.toUpperCase() : "";
  if (!HEX.test(background) || !HEX.test(foreground)) return { ok: false, error: "Choose colours as #RRGGBB." };
  if (contrastRatio(background, foreground) < LOGO_MIN_CONTRAST) return { ok: false, error: "Choose colours with more contrast, so the logo reads at small sizes." };
  if (typeof raw.font !== "string" || !FONT_IDS.has(raw.font)) return { ok: false, error: "Choose a font from the list." };
  return { ok: true, spec: { text, shape: raw.shape as LogoShape, background, foreground, font: raw.font, icon } };
}
