import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { DEFAULT_ORDER, fillLayerText, MAX_LAYERS, normalizeLayers, normalizeOrder, scopeCardArtwork, type CardLayer } from "@/lib/cards/design/layers";
import { normalizeCardSide } from "@/lib/cards/design/normalize";
import { defaultCardDesign, designFonts, withOwnArtwork } from "@/lib/cards/design/presets";
import { loadCardFonts } from "@/lib/cards/fonts";
import { buildCardScene, type CardOp } from "@/lib/cards/layout";
import { monoColour } from "@/lib/cards/layerLayout";
import { resolveCardPalette } from "@/lib/cards/palette";
import { renderMemberCard } from "@/lib/cards/render";
import { renderCardPng } from "@/lib/cards/renderPng";
import { EMPTY_BRANDING, type CardHolder } from "@/lib/cards/types";

const holder: CardHolder = {
  memberId: "m1", verifyToken: "a".repeat(43), verifyUrl: `http://localhost:3000/verify/${"a".repeat(43)}`,
  displayName: "Priya Raman", role: "Secretary", planName: "Annual member", details: [], photoUrl: null, idNumber: "SWO-0042", validUntil: "31 Mar 2027",
};
const context = { organisationName: "Space Works Kochi", planName: "Annual member" };
const card = { widthMm: 85.6, heightMm: 54 };
const ART = (org: string) => `/api/uploads/organisations/${org}/member-id-artwork/123e4567-e89b-42d3-a456-426614174000.webp`;

const text = (id: string, extra: Record<string, unknown> = {}) => ({ id, kind: "text", text: "Hello {name}", xMm: 5, yMm: 5, wMm: 60, hMm: 10, ...extra });
const texts = (ops: CardOp[]): string[] => ops.flatMap((op) => (op.kind === "text" ? [op.text] : op.kind === "group" ? texts(op.ops) : []));

describe("card layers", () => {
  it("keeps valid layers, bounds their numbers and drops unsafe ones", () => {
    const layers = normalizeLayers([
      text("ltext1", { sizePt: 500, opacityPct: -5, font: "not-a-font", color: "#abcdef", rotationDeg: 400 }),
      text("BAD id"),
      text("ltext1"),
      { id: "limage1", kind: "image", url: "https://evil.example/x.png", xMm: 0, yMm: 0, wMm: 10, hMm: 10 },
      { id: "limage2", kind: "image", url: ART("org1"), xMm: 0, yMm: 0, wMm: 10, hMm: 10 },
      { id: "lshape1", kind: "ellipse", fill: "red", stroke: "#000000", xMm: 0, yMm: 0, wMm: 10, hMm: 10 },
    ], card);
    expect(layers.map((layer) => layer.id)).toEqual(["ltext1", "limage2", "lshape1"]);
    expect(layers[0]).toMatchObject({ sizePt: 96, opacityPct: 0, font: "gilroy", color: "#ABCDEF", rotationDeg: 180 });
    expect(layers[2]).toMatchObject({ fill: null, stroke: "#000000" });
    expect(normalizeLayers(Array.from({ length: 50 }, (_, index) => text(`lmany${index}`)), card)).toHaveLength(MAX_LAYERS);
  });

  it("keeps a library font by id", () => {
    expect(normalizeLayers([text("ltext1", { font: "manjari" })], card)[0]).toMatchObject({ font: "manjari" });
  });

  it("stacks every built-in item and layer once: missing items at the bottom, new layers on top", () => {
    const layers = normalizeLayers([text("ltexta"), text("ltextb")], card);
    const order = normalizeOrder(["ltextb", "qr", "qr", "nonsense", "name"], layers);
    expect(order.slice(-4)).toEqual(["ltextb", "qr", "name", "ltexta"]);
    expect(order).toHaveLength(DEFAULT_ORDER.length + 2);
    expect(new Set(order).size).toBe(order.length);
  });

  it("fills placeholders per member", () => {
    expect(fillLayerText("{name} · {role} · {plan} · {number} · {validUntil} · {other}", holder)).toBe("Priya Raman · Secretary · Annual member · SWO-0042 · 31 Mar 2027 · {other}");
  });

  it("draws only the organisation's own artwork", () => {
    const side = normalizeCardSide({ ...defaultCardDesign(context).front, background: { imageUrl: ART("org2") }, layers: [{ id: "limage1", kind: "image", url: ART("org2"), xMm: 0, yMm: 0, wMm: 10, hMm: 10 }] }, context);
    expect(side.layers).toHaveLength(1);
    expect(scopeCardArtwork(side, "org1")).toMatchObject({ layers: [], background: { imageUrl: null } });
    expect(scopeCardArtwork(side, "org2").layers).toHaveLength(1);
    const design = withOwnArtwork({ ...defaultCardDesign(context), front: side }, "org1");
    expect(design.front.layers).toEqual([]);
  });

  it("lists the fonts a design's text layers use", () => {
    const design = defaultCardDesign(context);
    design.front.layers = normalizeLayers([text("ltexta", { font: "lobster" })], card);
    design.back.layers = normalizeLayers([text("ltextb", { font: "manjari" })], card);
    expect(designFonts(design)).toEqual(["lobster", "manjari"]);
  });

  it("uses custom colours as chosen, and still replaces unreadable text", () => {
    const front = defaultCardDesign(context).front;
    const palette = resolveCardPalette({ ...front, backgroundColor: "custom", textColor: "custom", customColours: { background: "#101010", accent: "#5B3FD9", text: "#111111" } }, null);
    expect(palette.background).toBe("#101010");
    expect(palette.textAdjusted).toBe(true);
    expect(monoColour("#FFEEDD")).toBe("#FFFFFF");
    expect(monoColour("#203040")).toBe("#000000");
  });
});

describe("layer scenes", () => {
  it("stacks layers and built-in items in order, skipping hidden layers", async () => {
    const { measurer } = await loadCardFonts(["lobster"]);
    const base = defaultCardDesign(context).front;
    const layers: CardLayer[] = normalizeLayers([text("ltexta", { font: "lobster", rotationDeg: 30, opacityPct: 50 }), text("ltextb", { text: "Hidden", hidden: true })], card);
    const settings = normalizeCardSide({ ...base, showRole: true, layers, order: ["ltexta", ...DEFAULT_ORDER, "ltextb"] }, context);
    const scene = buildCardScene({ settings, holder, branding: EMPTY_BRANDING, measurer });
    const group = scene.ops.find((op) => op.kind === "group");
    expect(group).toMatchObject({ kind: "group", rotateDeg: 30, opacity: 0.5 });
    expect(texts([group!])).toEqual(["Hello Priya Raman"]);
    expect(texts(scene.ops)).not.toContain("Hidden");
    // The layer sits under the name now.
    const order = scene.ops.map((op) => (op.kind === "group" ? "layer" : op.kind === "text" && op.text.includes("Priya") ? "name" : null)).filter(Boolean);
    expect(order.indexOf("layer")).toBeLessThan(order.indexOf("name"));
  });

  it("renders shapes, lines and library-font text into both the PNG and the PDF", async () => {
    const design = defaultCardDesign(context);
    design.front = normalizeCardSide({
      ...design.front, showQr: false, showPhoto: false, showLogo: false, showSymbol: false, heading: "", showCardLabel: false, showName: false, showFooter: false, showRole: false, showIdNumber: false, showValidUntil: false,
      layers: [
        { id: "lrect1", kind: "rect", xMm: 5, yMm: 5, wMm: 30, hMm: 20, fill: "#5B3FD9", radiusMm: 4, rotationDeg: 15 },
        { id: "lcirc1", kind: "ellipse", xMm: 40, yMm: 5, wMm: 30, hMm: 20, fill: null, stroke: "#000000", strokeMm: 1 },
        { id: "lline1", kind: "line", xMm: 5, yMm: 40, wMm: 70, hMm: 1, color: "#000000", rotationDeg: -10 },
        text("ltext1", { font: "anton", sizePt: 18, xMm: 5, yMm: 28, color: "#000000" }),
      ],
    }, context);
    const png = await renderMemberCard({ design, branding: EMPTY_BRANDING }, holder, "png", { title: "Card" });
    const { data } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
    let dark = 0;
    for (const value of data) if (value < 128) dark += 1;
    expect(dark / data.length).toBeGreaterThan(0.04);
    const pdf = await renderMemberCard({ design, branding: EMPTY_BRANDING }, holder, "pdf", { title: "Card" });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(2);
    // A layer turned by 15° draws inside a rotated group in the PNG's SVG.
    const { measurer } = await loadCardFonts(["anton"]);
    const scenePng = await renderCardPng(buildCardScene({ settings: design.front, holder, branding: EMPTY_BRANDING, measurer }));
    expect(scenePng.length).toBeGreaterThan(1000);
  });
});
