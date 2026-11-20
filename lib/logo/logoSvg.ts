import type { LogoShape, LogoSpec } from "./spec";
import { logoTextLength } from "./spec";

/*
 * The logo as an SVG string, from a validated spec. The browser preview passes a CSS font stack and the text is
 * an SVG <text>; the server passes glyph outlines shaped with fontkit, so no system font is involved, and both
 * share every size and position here. Only <svg>, <path>, <circle>, <rect>, <g> and <text> are written; colours
 * are validated hex, path data must be plain path commands and text is escaped.
 */

export const LOGO_SIZE = 512;
const CENTRE = LOGO_SIZE / 2;

/** One glyph outline: fontkit path data in font units, placed at (x, y) em from the text's start on its baseline. */
export type LogoGlyph = { d: string; xEm: number; yEm: number; unitsPerEm: number };

export type LogoText =
  | { kind: "font"; fontFamily: string }
  | { kind: "outline"; glyphs: LogoGlyph[]; widthEm: number; capHeightEm: number };

const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]*$/;
const n = (value: number) => Number(value.toFixed(2));
const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

const COLOUR = /^#[0-9A-Fa-f]{6}$/;
const safeColour = (value: string) => (COLOUR.test(value) ? value : "#000000");

/** Path data, or "" when it holds anything but path commands and numbers. */
export function safePathData(d: string) {
  return PATH_DATA.test(d) ? d : "";
}

function polygon(points: number, outer: number, inner = outer, rotateDeg = -90) {
  const out: string[] = [];
  const count = inner === outer ? points : points * 2;
  for (let i = 0; i < count; i += 1) {
    const radius = i % 2 && inner !== outer ? inner : outer;
    const angle = ((rotateDeg + (360 / count) * i) * Math.PI) / 180;
    out.push(`${n(CENTRE + radius * Math.cos(angle))} ${n(CENTRE + radius * Math.sin(angle))}`);
  }
  return `M${out.join(" L")} Z`;
}

/** The shape filling the 512 × 512 box, inset so strokes of anti-aliasing never touch the edge. */
export function shapeMarkup(shape: LogoShape, fill: string) {
  switch (shape) {
    case "circle":
      return `<circle cx="${CENTRE}" cy="${CENTRE}" r="244" fill="${fill}"/>`;
    case "rounded":
      return `<rect x="12" y="12" width="488" height="488" rx="112" fill="${fill}"/>`;
    case "hexagon":
      return `<path d="${polygon(6, 252)}" fill="${fill}"/>`;
    case "shield":
      return `<path d="M256 12 L476 84 V236 C476 364 384 454 256 500 C128 454 36 364 36 236 V84 Z" fill="${fill}"/>`;
    case "badge":
      return `<path d="${polygon(16, 250, 222)}" fill="${fill}"/>`;
  }
}

/** Where content sits: the shield's lower point and the badge's notches leave less room. */
const ROOM: Record<LogoShape, { width: number; centreY: number }> = {
  circle: { width: 340, centreY: 256 },
  rounded: { width: 380, centreY: 256 },
  hexagon: { width: 330, centreY: 256 },
  shield: { width: 330, centreY: 236 },
  badge: { width: 320, centreY: 256 },
};

/** Font size (px in the 512 box) for text of this many characters, before it is fitted to the room. */
export function logoFontSize(length: number, withIcon: boolean) {
  const base = length <= 1 ? 260 : length === 2 ? 210 : length === 3 ? 160 : length === 4 ? 128 : length <= 6 ? 100 : length <= 9 ? 76 : 62;
  return withIcon ? Math.round(base * 0.62) : base;
}

/** Cap height assumed for browser text; the server uses the face's own. */
const BROWSER_CAP_HEIGHT = 0.7;
/** Rough advance per character, used to keep browser text inside the room. */
const BROWSER_ADVANCE = 0.62;

function textMarkup(spec: LogoSpec, text: LogoText, room: { width: number }, baselineCentreY: number, withIcon: boolean) {
  const length = logoTextLength(spec.text);
  let size = logoFontSize(length, withIcon);
  if (text.kind === "font") {
    const estimated = length * BROWSER_ADVANCE * size;
    const fit = estimated > room.width ? ` textLength="${room.width}" lengthAdjust="spacingAndGlyphs"` : "";
    const baseline = baselineCentreY + (BROWSER_CAP_HEIGHT * size) / 2;
    return `<text x="${CENTRE}" y="${n(baseline)}" text-anchor="middle" font-family="${escape(text.fontFamily)}" font-weight="700" font-size="${size}" fill="${spec.foreground}"${fit}>${escape(spec.text)}</text>`;
  }
  if (text.widthEm * size > room.width) size = room.width / text.widthEm;
  const startX = CENTRE - (text.widthEm * size) / 2;
  const baseline = baselineCentreY + (text.capHeightEm * size) / 2;
  const paths = text.glyphs
    .map((glyph) => {
      const d = safePathData(glyph.d);
      if (!d) return "";
      const scale = size / glyph.unitsPerEm;
      return `<path transform="translate(${n(startX + glyph.xEm * size)} ${n(baseline - glyph.yEm * size)}) scale(${scale.toPrecision(5)} ${(-scale).toPrecision(5)})" d="${d}"/>`;
    })
    .join("");
  return paths ? `<g fill="${spec.foreground}">${paths}</g>` : "";
}

/** A stroke icon (24-unit box, stroke width 2) centred at (cx, cy), `size` px across. */
function iconMarkup(d: string, colour: string, cx: number, cy: number, size: number) {
  const safe = safePathData(d);
  if (!safe) return "";
  const scale = size / 24;
  return `<g transform="translate(${n(cx - size / 2)} ${n(cy - size / 2)}) scale(${n(scale)})" fill="none" stroke="${colour}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${safe}"/></g>`;
}

/** The whole logo. `iconPath` is the chosen icon's path data (null for none). */
export function buildLogoSvg(input: LogoSpec, text: LogoText, iconPath: string | null): string {
  // Colours are validated already; anything else still never reaches an attribute.
  const spec = { ...input, background: safeColour(input.background), foreground: safeColour(input.foreground) };
  const room = ROOM[spec.shape];
  const hasText = spec.text.length > 0;
  const hasIcon = Boolean(spec.icon && iconPath);
  const parts = [shapeMarkup(spec.shape, spec.background)];
  if (hasIcon && hasText) {
    parts.push(iconMarkup(iconPath!, spec.foreground, CENTRE, room.centreY - 70, 136));
    parts.push(textMarkup(spec, text, room, room.centreY + 82, true));
  } else if (hasIcon) {
    parts.push(iconMarkup(iconPath!, spec.foreground, CENTRE, room.centreY, 240));
  } else if (hasText) {
    parts.push(textMarkup(spec, text, room, room.centreY, false));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO_SIZE} ${LOGO_SIZE}" width="${LOGO_SIZE}" height="${LOGO_SIZE}">${parts.join("")}</svg>`;
}
