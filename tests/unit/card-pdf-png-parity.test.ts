import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_ORDER } from "@/lib/cards/design/layers";
import { normalizeCardSide } from "@/lib/cards/design/normalize";
import { CARD_PRESETS, defaultCardDesign, designFonts, type CardDesign } from "@/lib/cards/design/presets";
import { CARD_TEMPLATES, cardTemplateDesign } from "@/lib/cards/design/templates";
import { loadCardFonts } from "@/lib/cards/fonts";
import { buildCardScene, type CardOp, type CardScene } from "@/lib/cards/layout";
import { EMPTY_BRANDING, type CardHolder } from "@/lib/cards/types";
import { comparePdfToPng } from "../helpers/cardParity";

/*
 * Every built-in design and template, and a design that uses every kind of layer, prints the same in
 * the PDF as in the PNG. Set CARD_RENDER_DUMP to a folder to write both images of each case.
 */

const context = { organisationName: "Space Works Kochi", planName: "Annual member" };
const holder: CardHolder = {
  memberId: "m1", verifyToken: "a".repeat(43), verifyUrl: `http://localhost:3000/verify/${"a".repeat(43)}`,
  displayName: "ശ്രീക്ഷേത്ര മാധവൻ", role: "Secretary", planName: "Annual member · ₹1,200", details: [{ key: "blood", label: "Blood group", value: "O+" }],
  photoUrl: null, idNumber: "SWO-0042", validUntil: "31 Mar 2027",
};

function everyLayer(): CardDesign {
  const design = defaultCardDesign(context, "night");
  const layers = [
    { id: "lrectfaded", kind: "rect", xMm: 30, yMm: 18, wMm: 40, hMm: 22, fill: "#FF7447", stroke: "#FFFFFF", strokeMm: 1, radiusMm: 4, rotationDeg: 15, opacityPct: 60 },
    { id: "lellipse1", kind: "ellipse", xMm: -6, yMm: 52, wMm: 32, hMm: 22, fill: "#5B3FD9", stroke: "#DFFF8F", strokeMm: 0.8, opacityPct: 75 },
    { id: "lline1", kind: "line", xMm: 4, yMm: 80, wMm: 46, hMm: 0.8, color: "#DFFF8F", rotationDeg: -10 },
    { id: "ltextml", kind: "text", text: "{role} · അംഗം", font: "manjari", sizePt: 12, bold: true, xMm: 4, yMm: 58, wMm: 46, hMm: 8, color: "#FFFFFF", align: "center" },
    { id: "ltexthi", kind: "text", text: "सदस्य {number}", font: "mukta", sizePt: 10, xMm: 4, yMm: 66, wMm: 46, hMm: 6, color: "#B5CDFF", align: "right" },
    { id: "ltextturn", kind: "text", text: "Valid {validUntil}", font: "lobster", sizePt: 11, xMm: 4, yMm: 72, wMm: 46, hMm: 7, color: "#FFD447", rotationDeg: -8 },
  ];
  design.front = normalizeCardSide({
    ...design.front, showRole: true, printFieldKeys: ["blood"], elementFonts: { name: "playfair-display", header: "unbounded" },
    watermark: { kind: "text", text: "MEMBER", opacityPct: 12, colour: "accent", angleDeg: -30 },
    backgroundColor: "custom", customColours: { background: "#1E1446", accent: "#FF5FA2", text: "#FFFFFF" },
    layers, order: ["lrectfaded", ...DEFAULT_ORDER, "lellipse1", "lline1", "ltextml", "ltexthi", "ltextturn"],
  }, context);
  return design;
}

const cases: Array<[string, CardDesign]> = [
  ...CARD_PRESETS.map((preset) => [`preset ${preset}`, defaultCardDesign(context, preset)] as [string, CardDesign]),
  ...CARD_TEMPLATES.map((id) => [`template ${id}`, cardTemplateDesign(id, context)] as [string, CardDesign]),
  ["every kind of layer", everyLayer()],
  ["print economy", { ...everyLayer(), front: { ...everyLayer().front, colorMode: "mono" } }],
];

describe("PDF and PNG are the same card", () => {
  it.each(cases)("%s", async (label, design) => {
    const { measurer } = await loadCardFonts(designFonts(design));
    for (const side of ["front", "back"] as const) {
      const scene = buildCardScene({ settings: design[side], holder, branding: EMPTY_BRANDING, measurer });
      const result = await comparePdfToPng(scene);
      if (process.env.CARD_RENDER_DUMP) {
        const name = `${label.replace(/\W+/g, "-")}-${side}`;
        writeFileSync(join(process.env.CARD_RENDER_DUMP, `${name}.png`), result.png);
        writeFileSync(join(process.env.CARD_RENDER_DUMP, `${name}.pdf.png`), result.pdfRaster);
      }
      expect.soft(result.meanDifference, `${label} ${side}: average difference`).toBeLessThan(PARITY.mean);
      expect.soft(result.offShare, `${label} ${side}: share of pixels that differ`).toBeLessThan(PARITY.off);
    }
  }, 60_000);

  // The check itself must catch real differences, or the cases above prove nothing.
  it.each([
    ["the name moved by 2 mm", (scene: CardScene) => moveName(scene, 2)],
    ["a layer in another colour", (scene: CardScene) => recolourGroups(scene)],
  ])("fails when %s", async (_label, change) => {
    const design = everyLayer();
    const { measurer } = await loadCardFonts(designFonts(design));
    const scene = buildCardScene({ settings: design.front, holder, branding: EMPTY_BRANDING, measurer });
    const result = await comparePdfToPng(scene, change(scene));
    expect(result.meanDifference >= PARITY.mean || result.offShare >= PARITY.off).toBe(true);
  }, 60_000);
});

// Matching cards measure at most 2.5 on average and 0.05% of pixels; a name moved by 2 mm, 4.1 and 1.7%.
const PARITY = { mean: 3.2, off: 0.003 };

function moveName(scene: CardScene, mm: number): CardScene {
  return { ...scene, ops: scene.ops.map((op) => (op.kind === "text" && op.text.includes("മാധവൻ") ? { ...op, x: op.x + mm } : op)) };
}

function recolourGroups(scene: CardScene): CardScene {
  const recolour = (op: CardOp): CardOp => {
    if (op.kind === "group") return { ...op, ops: op.ops.map(recolour) };
    if ((op.kind === "rect" || op.kind === "ellipse") && op.fill) return { ...op, fill: "#00FF00" };
    return op;
  };
  return { ...scene, ops: scene.ops.map((op) => (op.kind === "group" ? recolour(op) : op)) };
}
