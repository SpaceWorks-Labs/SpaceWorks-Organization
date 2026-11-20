import "server-only";

import sharp from "sharp";
import { pathD, transformPath } from "./design/path";
import { maskCmds } from "./design/shapes";
import { adjustFactors, blurMm, cropRegion, type ImageArt } from "./imageArt";

/*
 * Layer pictures with crop, mask or adjustments (lib/cards/imageArt.ts), baked into a transparent PNG
 * so the PNG and the PDF embed identical pixels. Called by prepareCardImage for alpha artwork.
 */

function maskSvg(mask: ImageArt["mask"], widthPx: number, heightPx: number, radiusPx: number) {
  const d = pathD(transformPath(maskCmds(mask, widthPx, heightPx, radiusPx), 0, 0, 1, 1));
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}"><path d="${d}" fill="#fff"/></svg>`);
}

export async function prepareArtImage(body: Buffer, box: { wMm: number; hMm: number; fit: "contain" | "cover"; grayscale: boolean; radiusMm: number; art: ImageArt }, pxFor: (mm: number) => number) {
  const upright = await sharp(body, { failOn: "error", limitInputPixels: 40_000_000 }).rotate().toBuffer({ resolveWithObject: true });
  let image = sharp(upright.data);
  const cover = box.fit === "cover";
  if (cover) image = image.extract(cropRegion(upright.info.width, upright.info.height, box.wMm / box.hMm, box.art.crop));
  const factors = adjustFactors(box.art.adjust);
  if (factors.brightness !== 1 || factors.saturation !== 1) image = image.modulate({ brightness: factors.brightness, saturation: factors.saturation });
  if (factors.contrast !== 1) image = image.linear(factors.contrast, 128 * (1 - factors.contrast));
  if (box.grayscale) image = image.grayscale();
  const { data, info } = await image
    .resize(pxFor(box.wMm), pxFor(box.hMm), { fit: cover ? "fill" : "inside", withoutEnlargement: false })
    .ensureAlpha()
    .png()
    .toBuffer({ resolveWithObject: true });
  let out = sharp(data);
  const drawnWMm = cover ? box.wMm : Math.min(box.wMm, (box.hMm * info.width) / info.height);
  const pxPerMm = info.width / drawnWMm;
  const sigma = blurMm(box.art.adjust) * pxPerMm;
  if (sigma >= 0.3) out = sharp(await out.blur(sigma).png().toBuffer());
  const radiusPx = box.art.mask === "none" ? Math.min(box.radiusMm * pxPerMm, info.width / 2, info.height / 2) : 0;
  const mask = box.art.mask === "none" ? (radiusPx > 0 ? "square" : null) : box.art.mask;
  if (mask) out = out.composite([{ input: maskSvg(mask, info.width, info.height, radiusPx), blend: "dest-in" }]);
  return { format: "png" as const, data: await out.png({ compressionLevel: 9 }).toBuffer(), widthPx: info.width, heightPx: info.height };
}
