import { PDFDocument } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { memberFilterWhere } from "@/lib/cards/exportFilter";
import type { CardScene } from "@/lib/cards/layout";
import { renderCardsPdf } from "@/lib/cards/renderPdf";
import { sheetPlacer } from "@/lib/cards/sheet";
import type { CardHolder } from "@/lib/cards/types";
import { zipStream, type ZipEntry } from "@/lib/cards/zip";
import { safeFileName } from "@/lib/downloads";

vi.mock("@/lib/db", () => ({ prisma: {} }));

/*
 * Bulk card downloads: A4 sheets with mixed card sizes and fronts without backs, deadlines that free the
 * one render slot from a download nobody reads, and file names built from organisation-chosen card numbers.
 */

const LANDSCAPE = { widthMm: 85.6, heightMm: 54 };
const PORTRAIT = { widthMm: 54, heightMm: 85.6 };
const scene = (size: { widthMm: number; heightMm: number }): CardScene => ({ ...size, background: "#FFFFFF", ops: [] });
const card = (size: { widthMm: number; heightMm: number }, back: boolean) => (back ? [scene(size), scene(size)] : [scene(size)]);

// Landscape and portrait designs mixed, some cards without a back, and enough cards to spill onto a second sheet.
const MIXED = [
  card(LANDSCAPE, true), card(LANDSCAPE, false), card(LANDSCAPE, true),
  card(PORTRAIT, true), card(PORTRAIT, false),
  ...Array.from({ length: 6 }, (_, index) => card(LANDSCAPE, index % 2 === 0)),
  card(PORTRAIT, true),
];

describe("A4 card sheets", () => {
  it("never overlaps cards, keeps each back beside its front and gives each size its own sheets", () => {
    const place = sheetPlacer();
    const sheets: Array<Array<{ xMm: number; yMm: number; widthMm: number; heightMm: number }>> = [];
    for (const sides of MIXED) {
      const placed = place(sides);
      expect(placed).toHaveLength(sides.length);
      placed.forEach((at, index) => {
        if (at.newSheet) sheets.push([]);
        const sheet = sheets.at(-1)!;
        // One grid per sheet, so its crop marks match every card on it.
        expect(at.layout.cardWidthMm).toBe(sides[index]!.widthMm);
        expect(at.layout.cardHeightMm).toBe(sides[index]!.heightMm);
        if (sheet.length) expect([sheet[0]!.widthMm, sheet[0]!.heightMm]).toEqual([at.layout.cardWidthMm, at.layout.cardHeightMm]);
        const box = { xMm: at.xMm, yMm: at.yMm, widthMm: at.layout.cardWidthMm, heightMm: at.layout.cardHeightMm };
        expect(box.xMm + box.widthMm).toBeLessThanOrEqual(at.layout.sheetWidthMm);
        expect(box.yMm + box.heightMm).toBeLessThanOrEqual(at.layout.sheetHeightMm);
        for (const other of sheet) {
          const apart = box.xMm >= other.xMm + other.widthMm - 1e-9 || other.xMm >= box.xMm + box.widthMm - 1e-9 || box.yMm >= other.yMm + other.heightMm - 1e-9 || other.yMm >= box.yMm + box.heightMm - 1e-9;
          expect(apart).toBe(true);
        }
        sheet.push(box);
      });
      if (placed.length === 2) {
        expect(placed[1]!.newSheet).toBe(false);
        expect(placed[1]!.yMm).toBe(placed[0]!.yMm);
        expect(placed[1]!.xMm).toBeCloseTo(placed[0]!.xMm + placed[0]!.layout.cardWidthMm);
      }
    }
    // Landscape (3 cards), portrait (2), landscape (6 cards, the last spilling onto a second sheet), portrait.
    expect(sheets.map((sheet) => sheet.length)).toEqual([5, 3, 8, 1, 2]);
  });

  it("draws one page per sheet", async () => {
    const pdf = await PDFDocument.load(await renderCardsPdf(MIXED, { layout: "a4", title: "Sheets" }));
    expect(pdf.getPageCount()).toBe(5);
    const cards = await PDFDocument.load(await renderCardsPdf(MIXED, { layout: "card", title: "Cards" }));
    expect(cards.getPageCount()).toBe(MIXED.flat().length);
  });
});

describe("bulk ZIP deadlines", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function endless() {
    const state = { closed: false };
    async function* entries() {
      try {
        for (let index = 0; ; index += 1) yield { name: `${index}.pdf`, data: new Uint8Array(10) };
      } finally {
        state.closed = true;
      }
    }
    return { state, entries: entries() };
  }

  it("stops a download nobody reads and releases the slot once", async () => {
    vi.useFakeTimers();
    const released = vi.fn();
    const { state, entries } = endless();
    const reader = zipStream(entries, released, { idleMs: 1000, totalMs: 60_000 }).getReader();
    await reader.read();
    await vi.advanceTimersByTimeAsync(999);
    expect(released).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(released).toHaveBeenCalledTimes(1);
    expect(state.closed).toBe(true);
    await expect(reader.read()).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(released).toHaveBeenCalledTimes(1);
  });

  it("stops a download that runs too long even while it is being read", async () => {
    vi.useFakeTimers();
    const released = vi.fn();
    const { state, entries } = endless();
    const reader = zipStream(entries, released, { idleMs: 1000, totalMs: 5000 }).getReader();
    for (let step = 0; step < 5; step += 1) {
      await reader.read();
      await reader.read();
      await vi.advanceTimersByTimeAsync(900);
    }
    expect(released).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(released).toHaveBeenCalledTimes(1);
    expect(state.closed).toBe(true);
  });

  it("keeps the slot until the card being drawn at the deadline has finished", async () => {
    vi.useFakeTimers();
    const released = vi.fn();
    let finishRender: (entry: IteratorResult<ZipEntry>) => void = () => undefined;
    const slow: AsyncIterable<ZipEntry> = {
      [Symbol.asyncIterator]: () => ({
        next: () => new Promise<IteratorResult<ZipEntry>>((resolve) => (finishRender = resolve)),
        return: async () => ({ done: true, value: undefined }),
      }),
    };
    zipStream(slow, released, { idleMs: 1000, totalMs: 5000 });
    await vi.advanceTimersByTimeAsync(6000);
    expect(released).not.toHaveBeenCalled();
    finishRender({ done: false, value: { name: "a.pdf", data: new Uint8Array(1) } });
    await vi.advanceTimersByTimeAsync(0);
    expect(released).toHaveBeenCalledTimes(1);
  });
});

describe("card file names", () => {
  it("never lets a card number add folders to a ZIP or an attachment", async () => {
    const { cardFileName } = await import("@/lib/cards/bulk");
    const holder = (idNumber: string) => ({ idNumber, planName: "Annual", displayName: "Priya Raman" }) as CardHolder;
    expect(cardFileName(holder("../1"))).toBe("..-1-annual-priya-raman.pdf");
    expect(cardFileName(holder("SWO/2026/1"))).toBe("SWO-2026-1-annual-priya-raman.pdf");
    expect(cardFileName(holder("..\\..\\x"))).not.toMatch(/[/\\]/);
    expect(safeFileName("SWO/2026/1")).toBe("SWO-2026-1");
  });
});

describe("member status filters", () => {
  it("leaves members who have already renewed out of expiring, as the directory does", () => {
    const where = JSON.stringify(memberFilterWhere("expiring", new Date("2026-10-29T00:00:00Z")));
    expect(where).toContain('"renewals":{"none":{"status":{"notIn":["CANCELLED","EXPIRED","REJECTED"]}}}');
  });
});
