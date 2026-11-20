import "server-only";

import sharp from "sharp";
import { loadCardFonts } from "@/lib/cards/fonts";
import { buildLogoSvg, type LogoGlyph, type LogoText } from "./logoSvg";
import { logoIconPath } from "./icons";
import type { LogoSpec } from "./spec";

/** Pixels a side of the PNG handed to the logo store (which keeps 1200 px at most). */
const OUTPUT_SIDE = 1024;

/** The spec's text shaped with fontkit (bold, the chosen card font then Noto) as outlines. */
export async function logoOutlines(spec: LogoSpec): Promise<LogoText> {
  const fonts = await loadCardFonts([spec.font]);
  const text = fonts.measurer.clean(spec.text);
  const shaped = fonts.shape(text, 700, spec.font);
  const faces = fonts.chain(spec.font, 700);
  const glyphs: LogoGlyph[] = shaped.glyphs.map((item) => ({ d: item.glyph.path.toSVG(), xEm: item.xEm, yEm: item.yEm, unitsPerEm: faces[item.face]!.unitsPerEm }));
  const first = faces[0]!;
  const capHeightEm = (first.capHeight || first.ascent * 0.7) / first.unitsPerEm;
  return { kind: "outline", glyphs, widthEm: shaped.widthEm, capHeightEm };
}

/** The logo's SVG with outlined text: what the server rasterises. */
export async function renderLogoSvg(spec: LogoSpec) {
  const text: LogoText = spec.text ? await logoOutlines(spec) : { kind: "outline", glyphs: [], widthEm: 0, capHeightEm: 0 };
  return buildLogoSvg(spec, text, logoIconPath(spec.icon));
}

/** The logo as a transparent PNG file, ready for the organisation logo store. */
export async function renderLogoFile(spec: LogoSpec): Promise<File> {
  const svg = await renderLogoSvg(spec);
  const png = await sharp(Buffer.from(svg), { density: Math.round((72 * OUTPUT_SIDE) / 512) }).resize(OUTPUT_SIDE, OUTPUT_SIDE).png().toBuffer();
  return new File([new Uint8Array(png)], "logo.png", { type: "image/png" });
}
