import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_ORDER } from "@/lib/cards/design/layers";
import { normalizeCardSide } from "@/lib/cards/design/normalize";
import { defaultCardDesign, designFonts, type CardDesign } from "@/lib/cards/design/presets";
import { cardTemplateDesign } from "@/lib/cards/design/templates";
import { loadCardFonts } from "@/lib/cards/fonts";
import { buildCardScene, type CardScene } from "@/lib/cards/layout";
import { EMPTY_BRANDING, type CardHolder } from "@/lib/cards/types";
import { comparePdfToPng } from "../helpers/cardParity";

/*
 * Cards that print the member's units (the standard templates and a design with every unit
 * placeholder) draw them through the shaped-outline text path, and print the same in the PDF as in
 * the PNG. Set CARD_RENDER_DUMP to a folder to write both images of each case.
 */

const context = { organisationName: "Example Network", planName: "Annual member" };
const holder: CardHolder = {
  memberId: "m1", verifyToken: "b".repeat(43), verifyUrl: `http://localhost:3000/verify/${"b".repeat(43)}`,
  displayName: "Asha Menon", role: "Unit secretary", planName: "Annual member", details: [],
  photoUrl: null, idNumber: "EXN-N-N1-0042", validUntil: "31 Mar 2027",
  units: [{ level: 0, levelName: "Area", name: "North", code: "N" }, { level: 1, levelName: "Unit", name: "North 1", code: "N1" }],
};

function everyUnitPlaceholder(): CardDesign {
  const design = defaultCardDesign(context, "corporate");
  const layers = [
    { id: "lareaname", kind: "text", text: "Area {level1}", sizePt: 9, bold: true, xMm: 4, yMm: 48, wMm: 30, hMm: 5, color: "#142C2A" },
    { id: "lunitname", kind: "text", text: "Unit {level2} ({unitCode})", font: "mukta", sizePt: 9, xMm: 4, yMm: 53, wMm: 30, hMm: 5, color: "#FF7447", align: "right" },
    { id: "lunitchain", kind: "text", text: "{units} · {unit}", sizePt: 8, xMm: 4, yMm: 58, wMm: 30, hMm: 9, color: "#5B3FD9", rotationDeg: -6 },
  ];
  design.front = normalizeCardSide({ ...design.front, layers, order: [...DEFAULT_ORDER, "lareaname", "lunitname", "lunitchain"] }, context);
  return design;
}

const cases: Array<[string, CardDesign]> = [
  ["standard portrait", cardTemplateDesign("standard-portrait", context)],
  ["standard landscape", cardTemplateDesign("standard-landscape", context)],
  ["every unit placeholder", everyUnitPlaceholder()],
];

const texts = (scene: CardScene) => scene.ops.flatMap((op) => (op.kind === "group" ? op.ops : [op])).flatMap((op) => (op.kind === "text" ? [op.text] : []));

describe("cards with the member's units", () => {
  it("draws the units as shaped text on the standard templates", async () => {
    for (const id of ["standard-portrait", "standard-landscape"] as const) {
      const design = cardTemplateDesign(id, context);
      const { measurer } = await loadCardFonts(designFonts(design));
      const printed = texts(buildCardScene({ settings: design.front, holder, branding: EMPTY_BRANDING, measurer })).join(" | ");
      for (const value of ["North · North 1", "ASHA MENON", "Unit secretary", "Annual member", "EXN-N-N1-0042", "31 Mar 2027"]) expect(printed).toContain(value);
    }
  });

  it("prints nothing for a member without a unit", async () => {
    const design = everyUnitPlaceholder();
    const { measurer } = await loadCardFonts(designFonts(design));
    const printed = texts(buildCardScene({ settings: design.front, holder: { ...holder, units: [] }, branding: EMPTY_BRANDING, measurer }));
    expect(printed).toContain("Area");
    expect(printed.join(" ")).not.toMatch(/North|\{/);
  });

  it.each(cases)("%s: the PDF and the PNG are the same card", async (label, design) => {
    const { measurer } = await loadCardFonts(designFonts(design));
    for (const side of ["front", "back"] as const) {
      const scene = buildCardScene({ settings: design[side], holder, branding: EMPTY_BRANDING, measurer });
      const result = await comparePdfToPng(scene);
      if (process.env.CARD_RENDER_DUMP) {
        const name = `hierarchy-${label.replace(/\W+/g, "-")}-${side}`;
        writeFileSync(join(process.env.CARD_RENDER_DUMP, `${name}.png`), result.png);
        writeFileSync(join(process.env.CARD_RENDER_DUMP, `${name}.pdf.png`), result.pdfRaster);
      }
      // The same bounds as tests/unit/card-pdf-png-parity.test.ts.
      expect.soft(result.meanDifference, `${label} ${side}: average difference`).toBeLessThan(3.2);
      expect.soft(result.offShare, `${label} ${side}: share of pixels that differ`).toBeLessThan(0.003);
    }
  }, 60_000);
});
