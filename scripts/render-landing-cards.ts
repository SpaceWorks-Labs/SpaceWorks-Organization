import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { withOwnArtwork } from "@/lib/cards/design/presets";
import { cardTemplateDesign } from "@/lib/cards/design/templates";
import { renderMemberCard } from "@/lib/cards/render";
import type { CardHolder } from "@/lib/cards/types";
import { SAMPLE_CARDS } from "@/lib/marketing/sampleCards";
import { sampleLogoUploadUrl } from "./landing-cards/storage";

/*
 * Draws the landing page's sample member cards (lib/marketing/sampleCards.ts) with the product's own renderer:
 * each person's built-in template with SpaceWorks's logo (the Space Works symbol) and their unit,
 * the member's initials in place of a photo, then the front at 300 dpi, saved as WebP in public/landing/cards. Run with `npm run landing:cards` (tsx with
 * scripts/landing-cards/tsconfig.json, which stubs server-only and the storage layer) and commit the images.
 */

const OUT = path.join(process.cwd(), "public", "landing", "cards");

async function main() {
  await mkdir(OUT, { recursive: true });
  for (const card of SAMPLE_CARDS) {
    const org = card.organisation;
    const design = withOwnArtwork(cardTemplateDesign(card.template, { organisationName: org.name, planName: card.plan }), org.slug);
    const holder: CardHolder = {
      memberId: card.id,
      verifyToken: `sample-${card.id}`,
      // A sample: the QR opens a reserved example domain, never a real organisation's check page.
      verifyUrl: `https://example.org/verify/sample-${card.id}`,
      displayName: card.name,
      role: card.title,
      planName: card.plan,
      details: [],
      photoUrl: null,
      idNumber: card.idNumber,
      validUntil: card.validUntil,
      units: [{ level: 0, levelName: "Unit", name: card.unit, code: card.unit.slice(0, 3).toUpperCase() }],
    };
    const branding = { orgAccent: org.accent, organisationLogoUrl: sampleLogoUploadUrl(org.slug), watermarkUrl: null };
    const png = await renderMemberCard({ design, branding }, holder, "png", { side: "front", title: `${card.name} membership card` });
    const webp = await sharp(png).resize(card.width, card.height, { fit: "fill" }).webp({ quality: 88, effort: 6, smartSubsample: true }).toBuffer();
    await writeFile(path.join(OUT, `${card.id}.webp`), webp);
    console.log(`${card.image} ${card.width}x${card.height} ${(webp.length / 1024).toFixed(1)} KB`);
  }
}

void main();
