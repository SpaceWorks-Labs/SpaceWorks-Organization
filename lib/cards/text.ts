import { PT_TO_MM } from "./design/elements";

/*
 * Text layout for card scenes: wrapping and paragraphs with CSS-like half-leading, so baselines match
 * the browser preview. Measuring goes through a TextMeasurer backed by the shaped card fonts
 * (lib/cards/fonts.ts), so Indic conjuncts and the rupee sign measure as they draw.
 */

/** Regular and bold of a card font (Gilroy Light and ExtraBold by default), each with Noto fallbacks. */
export type FontWeight = 400 | 700;

export type TextMeasurer = {
  /** `font` is a card font id (lib/cards/fontCatalog.ts); Gilroy when omitted. */
  widthMm(text: string, weight: FontWeight, sizePt: number, trackingEm?: number, font?: string): number;
  /** Ascender and descender of the default face as fractions of the em (both positive). */
  ascent: number;
  descent: number;
  /** The same for one font. */
  metrics(font?: string): { ascent: number; descent: number };
  /** Characters no card font can draw are decomposed or dropped. */
  clean(text: string): string;
};

export type CardTextOp = {
  kind: "text"; x: number; baseline: number; text: string; sizePt: number; weight: FontWeight; color: string; trackingEm: number;
  /** A card font id; Gilroy when omitted. */
  font?: string;
  /** Watermarks only: clockwise rotation about (x, baseline), and 0–1 opacity. */
  rotateDeg?: number;
  opacity?: number;
};

/** Split a string into user-perceived characters, so a cut never lands inside a conjunct or a mark. */
function graphemes(text: string) {
  return [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text)].map((part) => part.segment);
}

/** Break text into lines no wider than `maxMm`: at spaces, and inside words too long on their own. */
export function wrapText(text: string, maxMm: number, measure: (value: string) => number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  const pushWord = (word: string) => {
    // overflow-wrap: anywhere — split a word that cannot fit on a line of its own.
    let rest = word;
    while (rest && measure(rest) > maxMm) {
      const chars = graphemes(rest);
      let cut = 1;
      while (cut < chars.length && measure(chars.slice(0, cut + 1).join("")) <= maxMm) cut += 1;
      lines.push(chars.slice(0, cut).join(""));
      rest = chars.slice(cut).join("");
    }
    current = rest;
  };
  for (const word of words) {
    if (!current) {
      pushWord(word);
      continue;
    }
    const candidate = `${current} ${word}`;
    if (measure(candidate) <= maxMm) current = candidate;
    else {
      lines.push(current);
      pushWord(word);
    }
  }
  if (current) lines.push(current);
  return lines;
}

export type TextStyle = { sizePt: number; weight: FontWeight; color: string; trackingEm?: number; lineHeight: number; font?: string };

/**
 * Lay out a left-, centre- or right-aligned paragraph whose first line box starts at `top`, using CSS
 * half-leading so baselines match the browser. Returns the ops and the bottom of the last line box.
 */
export function paragraph(measurer: TextMeasurer, raw: string, x: number, top: number, widthMm: number, style: TextStyle, align: "left" | "center" | "right" = "left") {
  const text = measurer.clean(raw);
  const tracking = style.trackingEm ?? 0;
  const measure = (value: string) => measurer.widthMm(value, style.weight, style.sizePt, tracking, style.font);
  const lines = text ? wrapText(text, Math.max(1, widthMm), measure) : [];
  const size = style.sizePt * PT_TO_MM;
  const lineBox = size * style.lineHeight;
  const { ascent, descent } = style.font ? measurer.metrics(style.font) : measurer;
  const halfLeading = (lineBox - (ascent + descent) * size) / 2;
  const ops: CardTextOp[] = lines.map((line, index) => ({
    kind: "text",
    x: align === "right" ? x + widthMm - measure(line) : align === "center" ? x + (widthMm - measure(line)) / 2 : x,
    baseline: top + index * lineBox + halfLeading + ascent * size,
    text: line,
    sizePt: style.sizePt,
    weight: style.weight,
    color: style.color,
    trackingEm: tracking,
    ...(style.font ? { font: style.font } : {}),
  }));
  return { ops, bottom: top + lines.length * lineBox, lines };
}
