import * as mupdf from "mupdf";
import sharp from "sharp";
import type { CardScene } from "@/lib/cards/layout";
import { renderCardsPdf } from "@/lib/cards/renderPdf";
import { renderCardPng } from "@/lib/cards/renderPng";

/*
 * The PDF and the PNG of a card side must look the same. Both are rasterised (the PDF with MuPDF at
 * the PNG's 300 dpi), softened a little, brought to one size and compared pixel by pixel. The two
 * rasterisers antialias edges differently (the QR is pixel-sharp in the PNG), which the softening
 * evens out; anything missing, moved by a millimetre or recoloured still shows.
 */

const COMPARE_WIDTH = 340;

/** Page sizes round to whole pixels differently, so the outermost 1% of each edge is left out. */
async function pixels(image: Uint8Array | Buffer, height: number) {
  const softened = await sharp(image).flatten({ background: "#FFFFFF" }).removeAlpha().blur(1.5).resize(COMPARE_WIDTH, height, { fit: "fill", kernel: "cubic" }).toBuffer();
  const [dx, dy] = [Math.ceil(COMPARE_WIDTH * 0.01), Math.ceil(height * 0.01)];
  return sharp(softened).extract({ left: dx, top: dy, width: COMPARE_WIDTH - 2 * dx, height: height - 2 * dy }).raw().toBuffer();
}

/** Compare the PDF of `scene` with the PNG of `pngScene` (the same scene unless a test wants them to differ). */
export async function comparePdfToPng(scene: CardScene, pngScene: CardScene = scene) {
  const png = await renderCardPng(pngScene);
  const pdf = await renderCardsPdf([scene], { layout: "card", title: "Parity" });
  const document = mupdf.Document.openDocument(pdf, "application/pdf");
  const page = document.loadPage(0);
  const raster = page.toPixmap(mupdf.Matrix.scale(300 / 72, 300 / 72), mupdf.ColorSpace.DeviceRGB, false, true).asPNG();
  const height = Math.round((COMPARE_WIDTH * scene.heightMm) / scene.widthMm);
  const [a, b] = await Promise.all([pixels(png, height), pixels(raster, height)]);
  let total = 0;
  let off = 0;
  for (let index = 0; index < a.length; index += 3) {
    const difference = Math.max(Math.abs(a[index]! - b[index]!), Math.abs(a[index + 1]! - b[index + 1]!), Math.abs(a[index + 2]! - b[index + 2]!));
    total += difference;
    if (difference > 40) off += 1;
  }
  const count = a.length / 3;
  return { meanDifference: total / count, offShare: off / count, png, pdfRaster: raster };
}
