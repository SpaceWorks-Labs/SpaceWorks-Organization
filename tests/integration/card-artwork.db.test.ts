import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getPublicUrl, uploadFile } from "@/lib/storage";
import { normalizeCardSide } from "@/lib/cards/design/normalize";
import { defaultCardDesign, withOwnArtwork } from "@/lib/cards/design/presets";
import { renderMemberCard } from "@/lib/cards/render";
import { EMPTY_BRANDING, type CardHolder } from "@/lib/cards/types";

/* Uploaded card artwork draws as a layer and as the background, and only for its own organisation. */

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
let organisationId = "";
let url = "";
const context = { organisationName: "Artwork Lab", planName: "" };
const holder: CardHolder = { memberId: "m", verifyToken: "a".repeat(43), verifyUrl: "http://localhost:3000/verify/a", displayName: "Priya Raman", role: null, planName: null, details: [], photoUrl: null, idNumber: null, validUntil: null };

beforeAll(async () => {
  organisationId = (await prisma.organisation.create({ data: { name: "Artwork Lab", slug: `artwork-${suffix}`, status: "ACTIVE" } })).id;
  const key = `organisations/${organisationId}/member-id-artwork/${randomUUID()}.webp`;
  // A solid red square: easy to find in the rendered card.
  const body = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#FF0000" } }).webp().toBuffer();
  await uploadFile({ key, body, contentType: "image/webp", organisationId });
  url = getPublicUrl(key);
});

afterAll(async () => {
  if (organisationId) {
    await prisma.asset.deleteMany({ where: { organisationId } });
    await prisma.organisation.delete({ where: { id: organisationId } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

async function redShare(png: Uint8Array) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let red = 0;
  for (let index = 0; index < data.length; index += info.channels) if (data[index]! > 200 && data[index + 1]! < 60 && data[index + 2]! < 60) red += 1;
  return red / (info.width * info.height);
}

describe("card artwork", () => {
  const bare = { showQr: false, showPhoto: false, showLogo: false, showSymbol: false, heading: "", showCardLabel: false, showName: false, showFooter: false };

  it("draws an image layer with rounded corners where it is placed", async () => {
    const design = defaultCardDesign(context, "student");
    design.front = normalizeCardSide({ ...design.front, ...bare, layers: [{ id: "limage1", kind: "image", url, xMm: 10, yMm: 10, wMm: 30, hMm: 30, fit: "cover", radiusMm: 15 }] }, context);
    const share = await redShare(await renderMemberCard({ design: withOwnArtwork(design, organisationId), branding: EMPTY_BRANDING }, holder, "png", { title: "Card" }));
    // A 30 mm circle on an 85.6 × 54 mm card covers about 15% of it.
    expect(share).toBeGreaterThan(0.12);
    expect(share).toBeLessThan(0.2);
  });

  it("fills the card with a background image", async () => {
    const design = defaultCardDesign(context, "student");
    design.front = normalizeCardSide({ ...design.front, ...bare, background: { imageUrl: url, fit: "cover", opacityPct: 100 } }, context);
    expect(await redShare(await renderMemberCard({ design: withOwnArtwork(design, organisationId), branding: EMPTY_BRANDING }, holder, "png", { title: "Card" }))).toBeGreaterThan(0.95);
    const pdf = await renderMemberCard({ design: withOwnArtwork(design, organisationId), branding: EMPTY_BRANDING }, holder, "pdf", { title: "Card" });
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("leaves another organisation's artwork off", async () => {
    const design = defaultCardDesign(context, "student");
    design.front = normalizeCardSide({ ...design.front, ...bare, background: { imageUrl: url, fit: "cover", opacityPct: 100 } }, context);
    expect(await redShare(await renderMemberCard({ design: withOwnArtwork(design, "someone-else"), branding: EMPTY_BRANDING }, holder, "png", { title: "Card" }))).toBe(0);
  });
});
