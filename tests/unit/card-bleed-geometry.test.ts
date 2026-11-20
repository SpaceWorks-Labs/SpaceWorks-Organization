import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { bleedPage, normalizeBleedMm, PRINT_BLEED_MM } from "@/lib/cards/bleed";
import { renderCardsPdf } from "@/lib/cards/renderPdf";
import { mmToPt } from "@/lib/cards/sheet";

const CR80 = { w: 85.6, h: 54 };

describe("normalizeBleedMm", () => {
  it("is 0 for nothing, zero, negatives and non-numbers", () => {
    for (const value of [undefined, null, 0, -2, Number.NaN, Number.POSITIVE_INFINITY, "3"]) expect(normalizeBleedMm(value)).toBe(0);
  });

  it("clamps a positive bleed to 2–5 mm", () => {
    expect(normalizeBleedMm(1)).toBe(2);
    expect(normalizeBleedMm(3)).toBe(3);
    expect(normalizeBleedMm(9)).toBe(5);
    expect(normalizeBleedMm(PRINT_BLEED_MM)).toBe(2);
  });
});

describe("bleedPage", () => {
  it("leaves a plain card-size page with no marks when there is no bleed", () => {
    expect(bleedPage(CR80.w, CR80.h, 0)).toEqual({ pageWidthMm: CR80.w, pageHeightMm: CR80.h, originXMm: 0, originYMm: 0, bleedMm: 0, marks: [] });
  });

  it("grows the page by twice the bleed and insets the card by the bleed", () => {
    const page = bleedPage(CR80.w, CR80.h, 2);
    expect(page.pageWidthMm).toBeCloseTo(89.6);
    expect(page.pageHeightMm).toBeCloseTo(58);
    expect(page.originXMm).toBe(2);
    expect(page.originYMm).toBe(2);
  });

  it("puts eight crop marks on the card's cut lines, inside the bleed only", () => {
    const page = bleedPage(CR80.w, CR80.h, 3);
    expect(page.marks).toHaveLength(8);
    const cutX = [3, 3 + CR80.w];
    const cutY = [3, 3 + CR80.h];
    for (const mark of page.marks) {
      const vertical = mark.x1 === mark.x2;
      if (vertical) {
        expect(cutX.some((x) => Math.abs(x - mark.x1) < 1e-9)).toBe(true);
        // Above the card's top edge or below its bottom edge, never across the card.
        expect(Math.max(mark.y1, mark.y2) <= 3 || Math.min(mark.y1, mark.y2) >= 3 + CR80.h).toBe(true);
      } else {
        expect(mark.y1).toBe(mark.y2);
        expect(cutY.some((y) => Math.abs(y - mark.y1) < 1e-9)).toBe(true);
        expect(Math.max(mark.x1, mark.x2) <= 3 || Math.min(mark.x1, mark.x2) >= 3 + CR80.w).toBe(true);
      }
      expect(Math.min(mark.x1, mark.x2, mark.y1, mark.y2)).toBeGreaterThanOrEqual(0);
      expect(Math.max(mark.x1, mark.x2)).toBeLessThanOrEqual(page.pageWidthMm);
      expect(Math.max(mark.y1, mark.y2)).toBeLessThanOrEqual(page.pageHeightMm);
    }
  });

  it("stops each mark short of the card edge", () => {
    const page = bleedPage(CR80.w, CR80.h, 2);
    const top = page.marks.filter((mark) => mark.x1 === mark.x2 && mark.y1 === 0);
    expect(top).toHaveLength(2);
    for (const mark of top) expect(mark.y2).toBeLessThan(2);
  });

  it("works for portrait cards and clamps an out-of-range bleed", () => {
    const page = bleedPage(CR80.h, CR80.w, 12);
    expect(page.bleedMm).toBe(5);
    expect(page.pageWidthMm).toBeCloseTo(CR80.h + 10);
    expect(page.pageHeightMm).toBeCloseTo(CR80.w + 10);
  });
});

describe("renderCardsPdf bleed", () => {
  const scene = { widthMm: CR80.w, heightMm: CR80.h, background: "#123456", ops: [] };
  const pageSizes = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((page) => page.getSize());

  it("keeps card-size pages without a bleed", async () => {
    const [size] = await pageSizes(await renderCardsPdf([[scene]], { layout: "card", title: "Test" }));
    expect(size!.width).toBeCloseTo(mmToPt(CR80.w), 3);
    expect(size!.height).toBeCloseTo(mmToPt(CR80.h), 3);
  });

  it("adds the bleed on every side of each card page", async () => {
    const sizes = await pageSizes(await renderCardsPdf([[scene, scene]], { layout: "card", title: "Test", bleedMm: 2 }));
    expect(sizes).toHaveLength(2);
    for (const size of sizes) {
      expect(size.width).toBeCloseTo(mmToPt(CR80.w + 4), 3);
      expect(size.height).toBeCloseTo(mmToPt(CR80.h + 4), 3);
    }
  });
});
