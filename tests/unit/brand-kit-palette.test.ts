import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { extractPalette } from "@/lib/cards/paletteQuantize";
import { paletteFromImage } from "@/lib/cards/logoPalette";

/** RGBA pixels: `count` of each colour, in order. */
function pixels(parts: Array<[[number, number, number, number], number]>) {
  const out: number[] = [];
  for (const [rgba, count] of parts) for (let i = 0; i < count; i += 1) out.push(...rgba);
  return new Uint8ClampedArray(out);
}

const RED: [number, number, number, number] = [220, 30, 40, 255];
const TEAL: [number, number, number, number] = [0, 110, 99, 255];
const INK: [number, number, number, number] = [20, 44, 42, 255];
const WHITE: [number, number, number, number] = [255, 255, 255, 255];
const CLEAR: [number, number, number, number] = [255, 0, 0, 0];

describe("extractPalette", () => {
  it("returns distinct colours most prominent first", () => {
    expect(extractPalette(pixels([[TEAL, 600], [RED, 300], [INK, 100]]))).toEqual(["#006E63", "#DC1E28", "#142C2A"]);
  });

  it("skips transparent and near-white pixels", () => {
    expect(extractPalette(pixels([[WHITE, 5000], [CLEAR, 5000], [[248, 250, 246, 255], 900], [RED, 100]]))).toEqual(["#DC1E28"]);
  });

  it("merges near duplicates into the more prominent colour", () => {
    const palette = extractPalette(pixels([[[10, 10, 10, 255], 400], [[24, 20, 22, 255], 300], [TEAL, 200]]));
    expect(palette).toHaveLength(2);
    expect(palette[1]).toBe("#006E63");
    // The two near-blacks count together, so black still leads.
    expect(palette[0]).toMatch(/^#[01][0-9A-F]{5}$/);
  });

  it("drops colours under one per cent and returns at most six", () => {
    const many = Array.from({ length: 9 }, (_, i) => [[i * 28, 255 - i * 28, (i * 97) % 256, 255], 100] as [[number, number, number, number], number]);
    expect(extractPalette(pixels(many)).length).toBeLessThanOrEqual(6);
    expect(extractPalette(pixels([[TEAL, 1000], [RED, 5]]))).toEqual(["#006E63"]);
  });

  it("returns nothing for an empty or fully transparent image", () => {
    expect(extractPalette(new Uint8ClampedArray())).toEqual([]);
    expect(extractPalette(pixels([[CLEAR, 50]]))).toEqual([]);
  });
});

describe("paletteFromImage", () => {
  it("reads the colours of a PNG made with sharp", async () => {
    // A white tile with a teal block filling two thirds and an orange stripe below it.
    const png = await sharp({ create: { width: 90, height: 90, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
      .composite([
        { input: { create: { width: 90, height: 60, channels: 4, background: { r: 0, g: 110, b: 99, alpha: 1 } } }, left: 0, top: 0 },
        { input: { create: { width: 90, height: 20, channels: 4, background: { r: 255, g: 116, b: 71, alpha: 1 } } }, left: 0, top: 60 },
      ])
      .png()
      .toBuffer();
    expect(await paletteFromImage(png)).toEqual(["#006E63", "#FF7447"]);
  });
});
