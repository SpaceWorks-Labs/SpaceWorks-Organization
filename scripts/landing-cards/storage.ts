import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { SAMPLE_ORG } from "@/lib/marketing/sampleCards";

/*
 * Stands in for lib/storage while scripts/render-landing-cards.ts runs (mapped by ./tsconfig.json), so the card
 * renderer reads the sample organisation's logo the way it reads a real upload: by a managed upload key, as
 * WebP bytes. Only the sample logo resolves; every other key is missing, as it would be in storage.
 */

const LOGO_UPLOAD = "00000000-0000-4000-8000-000000000001";
const LOGO_PX = 1200;

/** The managed upload URL the sample cards' branding points at. */
export function sampleLogoUploadUrl(slug: string) {
  return `/api/uploads/organisations/${slug}/organisation-logos/${LOGO_UPLOAD}.webp`;
}

export async function downloadFile(key: string) {
  const match = /^organisations\/([a-z-]+)\/organisation-logos\/[0-9a-f-]+\.webp$/.exec(key);
  if (match?.[1] !== SAMPLE_ORG.slug) return null;
  const svg = await readFile(path.join(process.cwd(), "public", SAMPLE_ORG.logo));
  const body = await sharp(svg, { density: 1200 }).resize(LOGO_PX, LOGO_PX, { fit: "inside" }).webp({ lossless: true }).toBuffer();
  return { body: new Uint8Array(body), contentType: "image/webp" };
}
