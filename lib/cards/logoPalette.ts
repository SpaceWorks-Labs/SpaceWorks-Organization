import "server-only";

import sharp from "sharp";
import { downloadFile } from "@/lib/storage";
import { uploadKeyFromUrl } from "@/lib/uploadUrl";
import { extractPalette } from "./paletteQuantize";

/** Logos are downsampled to this many pixels a side before counting colours. */
const SAMPLE_SIDE = 96;

/** Up to six brand colours from an image's bytes, most prominent first. */
export async function paletteFromImage(body: Uint8Array): Promise<string[]> {
  const { data } = await sharp(Buffer.from(body), { failOn: "error", limitInputPixels: 25_000_000 })
    .rotate()
    .resize(SAMPLE_SIDE, SAMPLE_SIDE, { fit: "inside", kernel: "nearest" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return extractPalette(data);
}

/** The palette of a managed logo upload, or null when it can't be read. The caller checks it is the organisation's own. */
export async function paletteFromLogoUrl(url: string): Promise<string[] | null> {
  const key = uploadKeyFromUrl(url);
  if (!key) return null;
  try {
    const file = await downloadFile(key);
    return file ? await paletteFromImage(file.body) : null;
  } catch {
    return null;
  }
}
