import { describe, expect, it } from "vitest";
import { normalizeCardDesign } from "@/lib/cards/design/presets";
import { CARD_TEMPLATES, cardTemplateDesign } from "@/lib/cards/design/templates";
import type { CardSideSettings } from "@/lib/cards/design/elements";
import { loadCardFonts } from "@/lib/cards/fonts";
import { buildCardScene, type CardOp } from "@/lib/cards/layout";
import { resolveCardPalette } from "@/lib/cards/palette";
import { contrastRatio, mix } from "@/lib/theme/accent";
import { EMPTY_BRANDING, type CardHolder } from "@/lib/cards/types";

/*
 * The built-in designs (lib/cards/design/templates.ts) as an ID card has to be: every text box on the card and
 * clear of the others for a very long name, role and plan, in Latin and Malayalam; every text layer readable on
 * what it sits on; the QR captioned; the back explaining how to check the card; and no stripes along the edges.
 * Assertions are on layout boxes, not snapshots.
 */

const context = { organisationName: "Kunj-Company Members' Association", planName: "Annual membership" };

function holder(name: string, extra: Partial<CardHolder> = {}): CardHolder {
  return {
    memberId: "m1", verifyToken: "t".repeat(43), verifyUrl: `https://example.org/verify/${"t".repeat(43)}`,
    displayName: name, role: "Full Stack Developer and Community Lead", planName: "Annual membership (concession)",
    details: [], photoUrl: null, idNumber: "KC/2026/0012", validUntil: "31 Mar 2027",
    units: [{ level: 0, levelName: "Area", name: "Kozhikode North", code: "KZN" }, { level: 1, levelName: "Unit", name: "Feroke", code: "FRK" }],
    contact: { website: "kunj-company.example", email: "membership.desk@kunj-company.example", phone: "+91 90000 00012" },
    ...extra,
  };
}

const LONG = "Abdul Samad Muhammed Jaseel Kunnathpeedika Puthiyaveettil";
const MALAYALAM = "അബ്ദുൾ സമദ് മുഹമ്മദ് ജസീൽ";

type Box = { text: string; x: number; y: number; w: number; h: number };

/** Unrotated text boxes (built-in items and flat layers), from the drawn ops. */
async function textBoxes(settings: CardSideSettings, member: CardHolder) {
  const { measurer } = await loadCardFonts([...Object.values(settings.elementFonts), ...settings.layers.flatMap((layer) => (layer.kind === "text" ? [layer.font] : []))]);
  const scene = buildCardScene({ settings, holder: member, branding: EMPTY_BRANDING, measurer });
  const boxes: Box[] = [];
  const visit = (ops: CardOp[]) => {
    for (const op of ops) {
      if (op.kind === "group" && op.rotateDeg === 0) visit(op.ops);
      if (op.kind !== "text" || op.rotateDeg) continue;
      // The ink of a line: capitals above the baseline, descenders below it (not the font's whole ascent).
      const size = op.sizePt * 0.3528;
      boxes.push({ text: op.text, x: op.x, y: op.baseline - 0.74 * size, w: measurer.widthMm(op.text, op.weight, op.sizePt, op.trackingEm, op.font, op.tabular), h: 0.95 * size });
    }
  };
  visit(scene.ops);
  return boxes;
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w - 0.05 && b.x < a.x + a.w - 0.05 && a.y < b.y + b.h - 0.05 && b.y < a.y + a.h - 0.05;

describe("built-in card designs", () => {
  it("offers both orientations of the new designs", () => {
    for (const id of ["minimal", "corporate", "badge"]) {
      const [landscape, portrait] = ["landscape", "portrait"].map((orientation) => CARD_TEMPLATES.find((template) => template.startsWith(id) && (template.endsWith(orientation) || (orientation === "landscape" && template === id))));
      expect(landscape, id).toBeTruthy();
      expect(portrait, id).toBeTruthy();
      const [l, p] = [landscape!, portrait!].map((template) => cardTemplateDesign(template, context).front);
      expect(l!.widthMm > l!.heightMm && p!.heightMm > p!.widthMm, id).toBe(true);
    }
  });

  it.each(CARD_TEMPLATES)("%s keeps every line on the card and clear of the others for long names", async (id) => {
    const design = cardTemplateDesign(id, context);
    for (const name of [LONG, MALAYALAM, "Ajzal P"]) {
      for (const settings of [design.front, design.back]) {
        const boxes = await textBoxes(settings, holder(name));
        for (const box of boxes) {
          expect(box.x, `${id}: "${box.text}" starts off the card`).toBeGreaterThanOrEqual(0);
          expect(box.x + box.w, `${id}: "${box.text}" runs off the card`).toBeLessThanOrEqual(settings.widthMm + 0.05);
          expect(box.y + box.h, `${id}: "${box.text}" runs off the bottom`).toBeLessThanOrEqual(settings.heightMm);
        }
        for (const [index, a] of boxes.entries()) {
          for (const b of boxes.slice(index + 1)) expect(overlaps(a, b), `${id}: "${a.text}" overlaps "${b.text}"`).toBe(false);
        }
      }
    }
  });

  it.each(CARD_TEMPLATES)("%s fits a very long name in two lines at most and keeps the role on one", async (id) => {
    const front = cardTemplateDesign(id, context).front;
    const boxes = await textBoxes(front, holder(LONG));
    const name = front.template === "bold" ? LONG.toLocaleUpperCase("en") : LONG;
    const nameLines = boxes.filter((box) => name.includes(box.text.replace(/…$/, "")) && box.text.length > 3);
    expect(nameLines.length).toBeGreaterThanOrEqual(1);
    expect(nameLines.length).toBeLessThanOrEqual(2);
    expect(boxes.filter((box) => box.text.startsWith("Full Stack")).length).toBe(1);
  });

  it.each(CARD_TEMPLATES)("%s keeps every text layer at 4.5:1 on what it sits on", (id) => {
    const design = cardTemplateDesign(id, context);
    for (const settings of [design.front, design.back]) {
      const background = resolveCardPalette(settings, "#006E63").background;
      settings.layers.forEach((layer, index) => {
        if (layer.kind !== "text") return;
        const cx = layer.xMm + layer.wMm / 2;
        const cy = layer.yMm + layer.hMm / 2;
        // What's under the text's centre: the topmost shape beneath it, faded over the card, else the card.
        const under = settings.layers.slice(0, index).reverse().find((shape) => shape.kind === "rect" && shape.fill && cx > shape.xMm && cx < shape.xMm + shape.wMm && cy > shape.yMm && cy < shape.yMm + shape.hMm);
        const surface = under && under.kind === "rect" && under.fill ? mix(under.fill, background, under.opacityPct / 100) : background;
        expect(contrastRatio(layer.color, surface), `${id}: ${layer.name || layer.id}`).toBeGreaterThanOrEqual(4.5);
      });
    }
  });

  it.each(CARD_TEMPLATES)("%s draws no stripe along an edge", (id) => {
    const design = cardTemplateDesign(id, context);
    for (const settings of [design.front, design.back]) {
      for (const layer of settings.layers) {
        if (layer.kind !== "line" && layer.kind !== "rect") continue;
        const wide = layer.wMm >= settings.widthMm * 0.8 && layer.hMm < 4;
        const atEdge = layer.yMm < 4 || layer.yMm + layer.hMm > settings.heightMm - 4;
        expect(wide && atEdge && layer.rotationDeg === 0, `${id}: ${layer.id}`).toBe(false);
      }
    }
  });

  it.each(CARD_TEMPLATES)("%s captions the QR and explains the card on its back", async (id) => {
    const design = cardTemplateDesign(id, context);
    expect(design.front.showQr && design.front.showQrCaption).toBe(true);
    const back = await textBoxes(design.back, holder("Ajzal P"));
    const text = back.map((box) => box.text).join(" ");
    expect(text).toContain("Scan the QR code on the front");
    expect(text).toContain("kunj-company.example");
    expect(design.back.layers.some((layer) => layer.kind === "text" && layer.text === "{contact}")).toBe(true);
  });

  it("survives the design schema unchanged", () => {
    for (const id of CARD_TEMPLATES) {
      const design = cardTemplateDesign(id, context);
      expect(normalizeCardDesign(JSON.parse(JSON.stringify(design)), context), id).toEqual(design);
    }
  });

  it("keeps designs saved before the QR caption without one", () => {
    const saved = JSON.parse(JSON.stringify(cardTemplateDesign("kasavu", context)));
    delete saved.front.showQrCaption;
    expect(normalizeCardDesign(saved, context).front.showQrCaption).toBe(false);
  });
});
