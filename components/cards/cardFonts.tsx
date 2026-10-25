import { CARD_FONTS, cardFont, cardFontCssName, DEFAULT_CARD_FONT } from "@/lib/cards/fontCatalog";

/*
 * The card typefaces in the browser: the same files the server renderer shapes. The default, "SWO
 * Card", is Gilroy Light and ExtraBold then Noto Sans for extended Latin and ₹, Noto Sans Malayalam and
 * Devanagari, under one family name with unicode ranges, so previews fall back exactly as printed
 * cards do. Each library face (lib/cards/fontCatalog.ts) is its own family, followed by "SWO Noto".
 */

export const CARD_FONT_FAMILY = "\"SWO Card\", Gilroy, system-ui, sans-serif";

const LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT = "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";
const MALAYALAM = "U+0307,U+0323,U+0951-0952,U+0964-0965,U+0D00-0D7F,U+1CDA,U+1CF2,U+200C-200D,U+20B9,U+25CC,U+A830-A832";
const DEVANAGARI = "U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+20A8,U+20B9,U+20F0,U+25CC,U+A830-A839,U+A8E0-A8FF,U+11B00-11B09";

const face = (family: string, file: string, weight: number, range?: string | null) =>
  `@font-face { font-family: "${family}"; src: url("${file}") format("woff2"); font-weight: ${weight}; font-style: normal; font-display: block;${range ? ` unicode-range: ${range};` : ""} }`;

/** The CSS font stack for a card font id. */
export function cardFontStack(id: string | undefined) {
  const font = cardFont(id);
  return font.id === DEFAULT_CARD_FONT ? CARD_FONT_FAMILY : `"${cardFontCssName(font.id)}", "SWO Noto", system-ui, sans-serif`;
}

export function cardFontFaceCss(origin = "") {
  const noto = (weight: number) => [
    [`/fonts/noto/NotoSans-LatinExt-${weight}.woff2`, LATIN_EXT],
    [`/fonts/noto/NotoSansMalayalam-${weight}.woff2`, MALAYALAM],
    [`/fonts/noto/NotoSansDevanagari-${weight}.woff2`, DEVANAGARI],
  ] as const;
  return [
    face("SWO Card", `${origin}/brand/fonts/Gilroy-Light.woff2`, 400),
    face("SWO Card", `${origin}/brand/fonts/Gilroy-ExtraBold.woff2`, 700),
    ...[400, 700].flatMap((weight) => [
      ...noto(weight).map(([file, range]) => face("SWO Card", `${origin}${file}`, weight, range)),
      face("SWO Noto", `${origin}/fonts/noto/NotoSans-Latin-${weight}.woff2`, weight, LATIN),
      ...noto(weight).map(([file, range]) => face("SWO Noto", `${origin}${file}`, weight, range)),
    ]),
  ].join("\n");
}

/** @font-face rules for one library face; nothing for the default. */
export function libraryFontFaceCss(id: string, origin = "") {
  const font = cardFont(id);
  if (font.id === DEFAULT_CARD_FONT) return "";
  return ([400, 700] as const).flatMap((weight) => font.files[weight].map((file) => face(cardFontCssName(font.id), `${origin}${file.path}`, weight, file.unicodeRange))).join("\n");
}

/**
 * Include once wherever cards are drawn on screen. `fonts` adds library faces up front ("all" for the
 * designer's font picker); a canvas adds the faces its own layers use by itself.
 */
export function CardFontFaces({ fonts = [] }: { fonts?: readonly string[] | "all" }) {
  const ids = fonts === "all" ? CARD_FONTS.map((font) => font.id) : fonts;
  return <style>{[cardFontFaceCss(), ...ids.map((id) => libraryFontFaceCss(id))].join("\n")}</style>;
}

/** The faces one canvas's layers use, hoisted and shared between canvases (React deduplicates by href). */
export function LayerFontFaces({ fonts }: { fonts: readonly string[] }) {
  return (
    <>
      {[...new Set(fonts)].filter((id) => cardFont(id).id !== DEFAULT_CARD_FONT).map((id) => (
        <style key={id} href={`swo-card-font-${id}`} precedence="default">{libraryFontFaceCss(id)}</style>
      ))}
    </>
  );
}
