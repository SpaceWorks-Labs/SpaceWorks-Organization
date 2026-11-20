import { writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_ORDER } from "@/lib/cards/design/layers";
import { normalizeCardSide } from "@/lib/cards/design/normalize";
import { defaultCardDesign, designFonts, type CardDesign } from "@/lib/cards/design/presets";
import { loadCardFonts } from "@/lib/cards/fonts";
import { buildCardScene } from "@/lib/cards/layout";
import { EMPTY_BRANDING, type CardHolder } from "@/lib/cards/types";
import { comparePdfToPng } from "../helpers/cardParity";

/*
 * Every newer layer kind and setting (shapes, bands, gradients, textures, shadows, icons, QR codes,
 * barcodes, photo frames, pictures with crop, mask and adjustments, flips, text effects and curved
 * text) prints the same in the PDF as in the PNG, on the front and on the back.
 */

const ART = "/api/uploads/organisations/org1/member-id-artwork/11111111-2222-4333-8444-555555555555.webp";
const PHOTO = "/api/uploads/organisations/org1/members/m1/photo-11111111-2222-4333-8444-666666666666.webp";

vi.mock("@/lib/storage", async () => {
  const sharpModule = (await import("sharp")).default;
  // A picture with structure (quadrants of colour), so crops, masks and adjustments all show.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="200" height="150" fill="#E8463C"/><rect x="200" width="200" height="150" fill="#2D7DD2"/><rect y="150" width="200" height="150" fill="#F2C14E"/><rect x="200" y="150" width="200" height="150" fill="#3BB273"/><circle cx="200" cy="150" r="70" fill="#FFFFFF"/></svg>`;
  const body = await sharpModule(Buffer.from(svg)).webp({ lossless: true }).toBuffer();
  return { downloadFile: async () => ({ body: new Uint8Array(body), contentType: "image/webp" }) };
});

const context = { organisationName: "Space Works Kochi", planName: "Annual member" };
const holder = (photo: boolean): CardHolder => ({
  memberId: "m1", verifyToken: "a".repeat(43), verifyUrl: `http://localhost:3000/verify/${"a".repeat(43)}`,
  displayName: "Asha Menon", role: "Secretary", planName: "Annual member", details: [], photoUrl: photo ? PHOTO : null,
  idNumber: "SWO-0042", validUntil: "31 Mar 2027", organisationName: "Space Works Kochi",
});

const grad = (type: "linear" | "radial", angleDeg = 0) => ({ type, angleDeg, stops: [{ atPct: 0, color: "#5B3FD9" }, { atPct: 60, color: "#FF5FA2" }, { atPct: 100, color: "#FFD447" }] });

const KINDS = [
  { id: "lwave", kind: "shape", shape: "waveBand", xMm: 0, yMm: 0, wMm: 54, hMm: 12, depthPct: 40, gradient: grad("linear", 0) },
  { id: "lfoot", kind: "shape", shape: "chevronBand", xMm: 0, yMm: 76, wMm: 54, hMm: 9.6, depthPct: 50, fill: "#006E63", flipY: true },
  { id: "lframe", kind: "shape", shape: "frame", xMm: 1.5, yMm: 1.5, wMm: 51, hMm: 82.6, depthPct: 10, radiusMm: 3, fill: "#DFFF8F" },
  { id: "lstar", kind: "shape", shape: "star", xMm: 3, yMm: 14, wMm: 14, hMm: 14, points: 5, depthPct: 45, fill: "#FF7447", stroke: "#142C2A", strokeMm: 0.6, shadow: { color: "#000000", dxMm: 0.8, dyMm: 0.8, opacityPct: 40 }, rotationDeg: 12 },
  { id: "lpattern", kind: "rect", xMm: 20, yMm: 14, wMm: 30, hMm: 14, radiusMm: 3, fill: "#B5CDFF", pattern: { kind: "dots", color: "#1E1446", scaleMm: 2.5, angleDeg: 20 } },
  { id: "lstripes", kind: "ellipse", xMm: 20, yMm: 30, wMm: 30, hMm: 12, fill: "#FFFFFF", pattern: { kind: "stripes", color: "#5B3FD9", scaleMm: 2, angleDeg: 45 }, opacityPct: 80 },
  { id: "lradial", kind: "shape", shape: "hexagon", xMm: 3, yMm: 30, wMm: 14, hMm: 12, gradient: grad("radial") },
  { id: "lcorner", kind: "shape", shape: "cornerRound", xMm: 42, yMm: 0, wMm: 12, hMm: 12, fill: "#FF5FA2", flipX: true },
  { id: "lribbon", kind: "shape", shape: "ribbon", xMm: 4, yMm: 44, wMm: 46, hMm: 7, depthPct: 50, fill: "#142C2A", pattern: { kind: "waves", color: "#3A5652", scaleMm: 2, angleDeg: 0 } },
  { id: "lpath", kind: "shape", shape: "path", xMm: 40, yMm: 44, wMm: 10, hMm: 8, path: "M0 100L50 0L100 100Q50 60 0 100Z", fill: "#FFD447", opacityPct: 70 },
  { id: "licon", kind: "icon", icon: "shield-check", xMm: 4, yMm: 53, wMm: 9, hMm: 9, color: "#006E63", strokeMm: 0.5 },
  { id: "lqrcode", kind: "qr", xMm: 38, yMm: 53, wMm: 13, hMm: 13, dark: "#142C2A", light: "#FFFFFF" },
  { id: "lbar", kind: "barcode", xMm: 14, yMm: 53, wMm: 22, hMm: 9, color: "#000000", background: "#FFFFFF", showText: true },
  { id: "lphoto", kind: "photo", mask: "hexagon", xMm: 4, yMm: 63, wMm: 12, hMm: 12, stroke: "#FF7447", strokeMm: 0.6 },
  { id: "lpic", kind: "image", url: ART, xMm: 18, yMm: 63, wMm: 16, hMm: 12, fit: "cover", mask: "circle", crop: { zoom: 1.6, xPct: 30, yPct: 40 }, adjust: { brightness: 10, contrast: 20, saturation: -30, blur: 2 }, shadow: { color: "#000000", dxMm: 0.6, dyMm: 0.6, opacityPct: 35 }, flipX: true },
  { id: "lpic2", kind: "image", url: ART, xMm: 36, yMm: 67, wMm: 15, hMm: 8, fit: "cover", radiusMm: 2, grayscale: true },
  { id: "ldash", kind: "line", xMm: 4, yMm: 76.5, wMm: 46, hMm: 0.6, color: "#142C2A", dash: "dashed" },
  { id: "ldots", kind: "line", xMm: 4, yMm: 78, wMm: 46, hMm: 0.8, color: "#FF7447", dash: "dotted" },
  { id: "ltcurve", kind: "text", text: "Official {organisation}", font: "gilroy", sizePt: 7, bold: true, textCase: "upper", xMm: 4, yMm: 2, wMm: 46, hMm: 9, color: "#FFFFFF", curve: 40, align: "center" },
  { id: "lthigh", kind: "text", text: "{name}", sizePt: 11, bold: true, xMm: 20, yMm: 14.5, wMm: 30, hMm: 6, color: "#142C2A", effect: "highlight", effectColor: "#DFFF8F", effectMm: 0.6 },
  { id: "ltout", kind: "text", text: "Member", sizePt: 14, bold: true, xMm: 20, yMm: 31, wMm: 30, hMm: 8, color: "#FFFFFF", effect: "outline", effectColor: "#142C2A", effectMm: 0.35, align: "center" },
  { id: "lthollow", kind: "text", text: "HOLLOW", sizePt: 12, bold: true, xMm: 4, yMm: 44.5, wMm: 30, hMm: 6, color: "#FFFFFF", effect: "hollow", effectMm: 0.25 },
  { id: "ltshadow", kind: "text", text: "{role}", font: "lobster", sizePt: 10, xMm: 18, yMm: 56, wMm: 20, hMm: 6, color: "#FFD447", effect: "shadow", effectColor: "#000000", effectMm: 0.4, rotationDeg: -6 },
  { id: "ltfit", kind: "text", text: "{plan} for the whole of the year, renewed every April", sizePt: 20, xMm: 4, yMm: 79.5, wMm: 46, hMm: 4.5, color: "#142C2A", autoFit: true, textCase: "title" },
];

function side(design: CardDesign, which: "front" | "back") {
  const current = design[which];
  return normalizeCardSide({
    ...current, widthMm: 54, heightMm: 85.6, showQr: false, showPhoto: false, showName: false, backgroundColor: "custom", customColours: { background: "#1E1446", accent: "#FF5FA2", text: "#FFFFFF" },
    layers: KINDS, order: [...DEFAULT_ORDER, ...KINDS.map((layer) => layer.id)],
  }, context);
}

function design(): CardDesign {
  const base = defaultCardDesign(context, "night");
  return { ...base, backEnabled: true, front: side(base, "front"), back: side(base, "back") };
}

describe("every layer kind prints the same in the PDF and the PNG", () => {
  it("keeps every kind through normalising", () => {
    expect(design().front.layers.map((layer) => layer.id)).toEqual(KINDS.map((layer) => layer.id));
    expect(design().back.layers).toHaveLength(KINDS.length);
  });

  it.each([["with a photo", true], ["without a photo", false]] as const)("front and back, %s", async (label, photo) => {
    const card = design();
    const { measurer } = await loadCardFonts(designFonts(card));
    for (const which of ["front", "back"] as const) {
      const settings = which === "back" ? { ...card.back, colorMode: photo ? "colour" as const : "mono" as const } : card.front;
      const scene = buildCardScene({ settings, holder: holder(photo), branding: EMPTY_BRANDING, measurer });
      const result = await comparePdfToPng(scene);
      if (process.env.CARD_RENDER_DUMP) {
        const name = `kinds-${label.replace(/\W+/g, "-")}-${which}`;
        writeFileSync(join(process.env.CARD_RENDER_DUMP, `${name}.png`), result.png);
        writeFileSync(join(process.env.CARD_RENDER_DUMP, `${name}.pdf.png`), result.pdfRaster);
      }
      expect.soft(result.meanDifference, `${label} ${which}: average difference`).toBeLessThan(3.2);
      expect.soft(result.offShare, `${label} ${which}: share of pixels that differ`).toBeLessThan(0.003);
    }
  }, 120_000);

  it("draws the pictures (the mocked storage is used)", async () => {
    const card = design();
    const { measurer } = await loadCardFonts(designFonts(card));
    const scene = buildCardScene({ settings: card.front, holder: holder(true), branding: EMPTY_BRANDING, measurer });
    const { png } = await comparePdfToPng(scene);
    expect((await sharp(png).metadata()).width).toBeGreaterThan(600);
    const images = JSON.stringify(scene.ops).match(/"kind":"image"/g) ?? [];
    expect(images.length).toBe(3);
  }, 60_000);
});
