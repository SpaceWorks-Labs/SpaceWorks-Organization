import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import sharp from "sharp";
import { downloadFile } from "@/lib/storage";
import { managedImageKey } from "./imageUrl";
import type { CardSymbolVariant } from "./palette";
import { MM_PER_INCH } from "./sheet";

/*
 * Server-side artwork for cards. Images are read only through the storage
 * layer by key (never fetched over the network), re-encoded with sharp and
 * sized for 300 dpi. The Space Works symbol comes from the unaltered master
 * SVGs in public/brand.
 */

export type PreparedImage = { format: "png" | "jpeg"; data: Buffer; widthPx: number; heightPx: number };

const RASTER_DPI = 300;
const MAX_IMAGE_PX = 1200;
/** Photos (the only cropped, "cover" images) never rasterise larger than this, so bulk renders stay small. */
export const MAX_PHOTO_PX = 600;

const pxFor = (mm: number) => Math.min(MAX_IMAGE_PX, Math.max(8, Math.ceil((mm / MM_PER_INCH) * RASTER_DPI)));

function roundedMask(width: number, height: number, radius: number) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`);
}

/** Round an image's corners into its transparency; `radiusMm` is measured on a box `wMm` wide. */
async function roundCorners(png: Buffer, widthPx: number, heightPx: number, radiusMm: number, wMm: number) {
  const radius = Math.min((radiusMm / wMm) * widthPx, widthPx / 2, heightPx / 2);
  if (radius <= 0) return png;
  return sharp(png).composite([{ input: roundedMask(widthPx, heightPx, radius), blend: "dest-in" }]).png({ compressionLevel: 9 }).toBuffer();
}

/**
 * Read and rasterise one managed image for a box of `wMm × hMm`. Logos keep
 * transparency (PNG, contained); photos are cropped square, masked to their
 * shape and flattened onto the card colour as JPEG, which keeps bulk PDFs
 * small. Layer artwork (`alpha`) keeps its transparency, is cropped to the
 * box when it covers it, and has `radiusMm` corners cut into it. Returns null
 * when the URL isn't a managed upload or can't be read.
 */
export async function prepareCardImage(
  url: string,
  box: { wMm: number; hMm: number; fit: "contain" | "cover"; shape: "none" | "circle" | "rounded"; grayscale: boolean; background: string; alpha?: boolean; radiusMm?: number },
): Promise<PreparedImage | null> {
  const key = managedImageKey(url);
  if (!key) return null;
  try {
    const file = await downloadFile(key);
    if (!file) return null;
    let image = sharp(Buffer.from(file.body), { failOn: "error", limitInputPixels: 40_000_000 }).rotate();
    if (box.grayscale) image = image.grayscale();
    if (box.alpha) {
      const cover = box.fit === "cover";
      const { data, info } = await image
        .resize(pxFor(box.wMm), pxFor(box.hMm), { fit: cover ? "cover" : "inside", withoutEnlargement: false })
        .ensureAlpha()
        .png({ compressionLevel: 9 })
        .toBuffer({ resolveWithObject: true });
      // A contained image is narrower than its box: measure its corners on the width it is drawn at.
      const drawnWMm = cover ? box.wMm : Math.min(box.wMm, (box.hMm * info.width) / info.height);
      const rounded = await roundCorners(data, info.width, info.height, box.radiusMm ?? 0, drawnWMm);
      return { format: "png", data: rounded, widthPx: info.width, heightPx: info.height };
    }
    if (box.fit === "cover") {
      const side = Math.min(MAX_PHOTO_PX, pxFor(Math.max(box.wMm, box.hMm)));
      let squared = await image.resize(side, side, { fit: "cover" }).ensureAlpha().png().toBuffer();
      if (box.shape !== "none") {
        squared = await sharp(squared).composite([{ input: roundedMask(side, side, box.shape === "circle" ? side / 2 : side * 0.2), blend: "dest-in" }]).png().toBuffer();
      }
      const data = await sharp(squared).flatten({ background: box.background }).jpeg({ quality: 88, chromaSubsampling: "4:4:4" }).toBuffer();
      return { format: "jpeg", data, widthPx: side, heightPx: side };
    }
    const { data, info } = await image
      .resize(pxFor(box.wMm), pxFor(box.hMm), { fit: "inside", withoutEnlargement: false })
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true });
    return { format: "png", data, widthPx: info.width, heightPx: info.height };
  } catch {
    // A missing or undecodable image is left off the card rather than failing it.
    return null;
  }
}

/**
 * A cache so shared artwork (logo, watermark) is read and encoded
 * once per render. Per-person photos (`shared: false`) bypass it, so a bulk
 * render never holds every member's photo in memory.
 */
export function imageCache() {
  const entries = new Map<string, Promise<PreparedImage | null>>();
  return (url: string, box: Parameters<typeof prepareCardImage>[1], shared = true) => {
    if (!shared) return prepareCardImage(url, box);
    const cacheKey = JSON.stringify([url, box]);
    let entry = entries.get(cacheKey);
    if (!entry) {
      entry = prepareCardImage(url, box);
      entries.set(cacheKey, entry);
    }
    return entry;
  };
}

export type SymbolPath = { d: string; fill: string };
export const SYMBOL_VIEWBOX = { width: 136, height: 126 } as const;

const SYMBOL_FILES: Record<CardSymbolVariant, string> = {
  full: "symbol.svg",
  reversed: "symbol-reversed.svg",
  ink: "symbol-one-colour-ink.svg",
};
const symbolCache = new Map<CardSymbolVariant, Promise<SymbolPath[]>>();

/** The master symbol's paths and fills, exactly as drawn in public/brand/logo. */
export function loadSymbolPaths(variant: CardSymbolVariant): Promise<SymbolPath[]> {
  let entry = symbolCache.get(variant);
  if (!entry) {
    entry = readFile(path.join(process.cwd(), "public", "brand", "logo", SYMBOL_FILES[variant]), "utf8").then((svg) =>
      [...svg.matchAll(/<path\s+d="([^"]+)"\s+fill="(#[0-9A-Fa-f]{6})"\s*\/>/g)].map((match) => ({ d: match[1]!, fill: match[2]! })),
    );
    entry.catch(() => symbolCache.delete(variant));
    symbolCache.set(variant, entry);
  }
  return entry;
}

/**
 * QR modules at error level M, like the preview: horizontal runs of dark
 * modules (column, row, length) and the same as one SVG path in module units.
 */
export function qrModules(value: string) {
  const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
  const { size, data } = qr.modules;
  const runs: Array<[number, number, number]> = [];
  for (let row = 0; row < size; row += 1) {
    let column = 0;
    while (column < size) {
      if (!data[row * size + column]) {
        column += 1;
        continue;
      }
      const start = column;
      while (column < size && data[row * size + column]) column += 1;
      runs.push([start, row, column - start]);
    }
  }
  const d = runs.map(([column, row, length]) => `M${column} ${row}h${length}v1h${-length}z`).join("");
  return { size, runs, d };
}

/** An SVG path for a rectangle with rounded corners (radius clamped to fit). */
export function roundedRectPath(x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  const f = (n: number) => Number(n.toFixed(3));
  if (r === 0) return `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}z`;
  // Cubic approximation of a quarter circle.
  const c = r * 0.5523;
  return [
    `M${f(x + r)} ${f(y)}`,
    `H${f(x + w - r)}`,
    `C${f(x + w - r + c)} ${f(y)} ${f(x + w)} ${f(y + r - c)} ${f(x + w)} ${f(y + r)}`,
    `V${f(y + h - r)}`,
    `C${f(x + w)} ${f(y + h - r + c)} ${f(x + w - r + c)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)}`,
    `H${f(x + r)}`,
    `C${f(x + r - c)} ${f(y + h)} ${f(x)} ${f(y + h - r + c)} ${f(x)} ${f(y + h - r)}`,
    `V${f(y + r)}`,
    `C${f(x)} ${f(y + r - c)} ${f(x + r - c)} ${f(y)} ${f(x + r)} ${f(y)}`,
    "Z",
  ].join("");
}

/** An SVG path for the ellipse inscribed in a box, as four cubic arcs. */
export function ellipsePath(x: number, y: number, w: number, h: number) {
  const f = (n: number) => Number(n.toFixed(3));
  const [rx, ry, cx, cy] = [w / 2, h / 2, x + w / 2, y + h / 2];
  const [kx, ky] = [rx * 0.5523, ry * 0.5523];
  return [
    `M${f(cx)} ${f(y)}`,
    `C${f(cx + kx)} ${f(y)} ${f(x + w)} ${f(cy - ky)} ${f(x + w)} ${f(cy)}`,
    `C${f(x + w)} ${f(cy + ky)} ${f(cx + kx)} ${f(y + h)} ${f(cx)} ${f(y + h)}`,
    `C${f(cx - kx)} ${f(y + h)} ${f(x)} ${f(cy + ky)} ${f(x)} ${f(cy)}`,
    `C${f(x)} ${f(cy - ky)} ${f(cx - kx)} ${f(y)} ${f(cx)} ${f(y)}`,
    "Z",
  ].join("");
}

/** Where a contained image of `widthPx × heightPx` lands inside a box. */
export function containBox(box: { x: number; y: number; w: number; h: number }, widthPx: number, heightPx: number) {
  const scale = Math.min(box.w / widthPx, box.h / heightPx);
  const w = widthPx * scale;
  const h = heightPx * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}
