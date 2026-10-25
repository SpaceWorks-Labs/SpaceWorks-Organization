import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { create, type Font, type Glyph } from "fontkit";
import { PT_TO_MM } from "./design/elements";
import { cardFont, DEFAULT_CARD_FONT } from "./fontCatalog";
import type { FontWeight, TextMeasurer } from "./text";

/*
 * Card type: Gilroy Light (400) and ExtraBold (700) from the brand kit by default, or any face of the
 * card font library (lib/cards/fontCatalog.ts), each followed by OFL Noto Sans faces for what it lacks
 * (extended Latin, the rupee sign, Malayalam, Devanagari). Text is split into runs by the first face
 * that can draw each character and every run is shaped with fontkit `layout()`, so conjuncts,
 * reordered vowel signs and mark positioning come out right. The same shaping measures text for
 * layout and draws it in both the PDF and the PNG, with no system fonts. Library faces load the first
 * time a design uses them and stay loaded.
 */

const PUBLIC = path.join(process.cwd(), "public");
const NOTO: Record<FontWeight, string[]> = {
  400: ["/fonts/noto/NotoSans-Latin-400.woff2", "/fonts/noto/NotoSans-LatinExt-400.woff2", "/fonts/noto/NotoSansMalayalam-400.woff2", "/fonts/noto/NotoSansDevanagari-400.woff2"],
  700: ["/fonts/noto/NotoSans-Latin-700.woff2", "/fonts/noto/NotoSans-LatinExt-700.woff2", "/fonts/noto/NotoSansMalayalam-700.woff2", "/fonts/noto/NotoSansDevanagari-700.woff2"],
};
export const FONT_WEIGHTS: FontWeight[] = [400, 700];

/** One shaped glyph: which face of the weight's chain, and where it sits (em units, y up). */
export type ShapedGlyph = { face: number; glyph: Glyph; xEm: number; yEm: number; advances: boolean };
export type ShapedText = { glyphs: ShapedGlyph[]; widthEm: number; advancing: number };
type Chains = Record<FontWeight, Font[]>;

export type CardFonts = {
  /** The faces of `font` (the default when it isn't loaded) for one weight, in fallback order. */
  chain(font: string | undefined, weight: FontWeight): Font[];
  shape(text: string, weight: FontWeight, font?: string): ShapedText;
  measurer: TextMeasurer;
};

const ASCII_FALLBACK: Record<string, string> = { "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "…": "...", "·": "-", "•": "-", " ": " " };
const JOINERS = new Set([0x200c, 0x200d]);
const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
const CACHE_LIMIT = 4000;

const files = new Map<string, Promise<Font>>();
const chains = new Map<string, Chains>();
const loading = new Map<string, Promise<void>>();
let fonts: CardFonts | null = null;

function faceFor(chain: Font[], cluster: string) {
  const codePoints = [...cluster].map((char) => char.codePointAt(0)!);
  const whole = chain.findIndex((face) => codePoints.every((cp) => cp === 32 || JOINERS.has(cp) || face.hasGlyphForCodePoint(cp)));
  return whole >= 0 ? whole : chain.findIndex((face) => face.hasGlyphForCodePoint(codePoints[0]!));
}

function buildFonts(): CardFonts {
  const cache = new Map<string, ShapedText>();
  const chain = (font: string | undefined, weight: FontWeight) => (chains.get(font ?? DEFAULT_CARD_FONT) ?? chains.get(DEFAULT_CARD_FONT)!)[weight];
  const familyOf = (font: string | undefined) => (font && chains.has(font) ? font : DEFAULT_CARD_FONT);

  const shape = (text: string, weight: FontWeight, font?: string): ShapedText => {
    const family = familyOf(font);
    const key = `${family}\u0000${weight}\u0000${text}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const faces = chain(family, weight);
    // Runs of grapheme clusters that share a face. Spaces stay with the run they are in.
    const runs: Array<{ face: number; text: string }> = [];
    for (const { segment } of segmenter.segment(text)) {
      const last = runs.at(-1);
      const face = segment === " " && last ? last.face : faceFor(faces, segment);
      if (face < 0) continue;
      if (last && last.face === face) last.text += segment;
      else runs.push({ face, text: segment });
    }
    const glyphs: ShapedGlyph[] = [];
    let cursor = 0;
    let advancing = 0;
    for (const run of runs) {
      const face = faces[run.face]!;
      const laid = face.layout(run.text);
      laid.glyphs.forEach((glyph, index) => {
        const position = laid.positions[index]!;
        const advances = position.xAdvance > 0;
        glyphs.push({ face: run.face, glyph, xEm: cursor + position.xOffset / face.unitsPerEm, yEm: position.yOffset / face.unitsPerEm, advances });
        cursor += position.xAdvance / face.unitsPerEm;
        if (advances) advancing += 1;
      });
    }
    const shaped = { glyphs, widthEm: cursor, advancing };
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(key, shaped);
    return shaped;
  };

  // Keep only characters some face of both default weights can draw. Every chain ends in the same
  // Noto faces, so whatever passes here draws in any font, and measuring and drawing agree.
  const supports = (codePoint: number) => codePoint === 32 || JOINERS.has(codePoint) || FONT_WEIGHTS.every((weight) => chain(undefined, weight).some((face) => face.hasGlyphForCodePoint(codePoint)));
  const clean = (value: string) => {
    let out = "";
    for (const char of value.replace(/[\t\r\n]+/g, " ")) {
      const codePoint = char.codePointAt(0)!;
      if (supports(codePoint)) out += char;
      else if (ASCII_FALLBACK[char]) out += ASCII_FALLBACK[char];
      else out += [...char.normalize("NFKD")].filter((part) => supports(part.codePointAt(0)!)).join("");
    }
    return out;
  };

  const metrics = (font?: string) => {
    const regular = chain(font, 400)[0]!;
    return { ascent: regular.ascent / regular.unitsPerEm, descent: Math.abs(regular.descent) / regular.unitsPerEm };
  };
  const base = metrics();
  const measurer: TextMeasurer = {
    widthMm(text, weight, sizePt, trackingEm = 0, font) {
      const shaped = shape(text, weight, font);
      return (shaped.widthEm + trackingEm * shaped.advancing) * sizePt * PT_TO_MM;
    },
    ascent: base.ascent,
    descent: base.descent,
    metrics,
    clean,
  };
  return { chain, shape, measurer };
}

function loadFile(file: string) {
  let entry = files.get(file);
  if (!entry) {
    entry = readFile(path.join(PUBLIC, file)).then((data) => {
      const font = create(data);
      if (!("layout" in font)) throw new Error(`Card font ${file} is a collection.`);
      return font;
    });
    entry.catch(() => files.delete(file));
    files.set(file, entry);
  }
  return entry;
}

function loadFamily(id: string) {
  let entry = loading.get(id);
  if (!entry) {
    const family = cardFont(id);
    entry = (async () => {
      const [regular, bold] = await Promise.all(FONT_WEIGHTS.map((weight) => Promise.all([...family.files[weight].map((file) => file.path), ...NOTO[weight]].map(loadFile))));
      chains.set(family.id, { 400: regular!, 700: bold! });
    })();
    entry.catch(() => loading.delete(id));
    loading.set(id, entry);
  }
  return entry;
}

/** The card fonts, with the default face and every face in `families` loaded. Unknown ids are ignored. */
export async function loadCardFonts(families: Iterable<string> = []): Promise<CardFonts> {
  const wanted = new Set([DEFAULT_CARD_FONT, ...[...families].map((id) => cardFont(id).id)]);
  await Promise.all([...wanted].map(loadFamily));
  fonts ??= buildFonts();
  return fonts;
}

/** Positioned glyphs for one text op, in millimetres from the op's origin (y down), with tracking. */
export function placeGlyphs(fonts: CardFonts, text: string, weight: FontWeight, sizePt: number, trackingEm: number, font?: string) {
  const shaped = fonts.shape(text, weight, font);
  const faces = fonts.chain(font, weight);
  const family = faces === fonts.chain(undefined, weight) ? DEFAULT_CARD_FONT : font!;
  const em = sizePt * PT_TO_MM;
  let tracked = 0;
  let started = false;
  return shaped.glyphs.map((item) => {
    // Letter spacing goes between spacing glyphs; marks stay on the glyph they belong to.
    if (item.advances) {
      if (started) tracked += trackingEm;
      started = true;
    }
    const face = faces[item.face]!;
    return { key: `${family}:${weight}:${item.face}:${item.glyph.id}`, glyph: item.glyph, x: (item.xEm + tracked) * em, y: -item.yEm * em, scale: em / face.unitsPerEm };
  });
}
