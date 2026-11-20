import { existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { SAMPLE_CARDS, SAMPLE_ORG } from "@/lib/marketing/sampleCards";

/** The landing page's sample cards (lib/marketing/sampleCards.ts), drawn by `npm run landing:cards`. */
const publicDir = join(import.meta.dirname, "../../public");

describe("landing sample cards", () => {
  it("has a rendered image for every card, at the size the page reserves", async () => {
    for (const card of SAMPLE_CARDS) {
      const file = join(publicDir, card.image);
      expect(existsSync(file), `${card.image} is missing: run npm run landing:cards`).toBe(true);
      const meta = await sharp(file).metadata();
      expect([meta.format, meta.width, meta.height], card.image).toEqual(["webp", card.width, card.height]);
    }
  });

  it("uses each image, design and card number once", () => {
    expect(new Set(SAMPLE_CARDS.map((card) => card.image)).size).toBe(SAMPLE_CARDS.length);
    expect(new Set(SAMPLE_CARDS.map((card) => card.template)).size).toBe(SAMPLE_CARDS.length);
    expect(new Set(SAMPLE_CARDS.map((card) => card.idNumber)).size).toBe(SAMPLE_CARDS.length);
  });

  it("shows the whole team on SpaceWorks cards, in both orientations", () => {
    expect(SAMPLE_CARDS.map((card) => card.name).sort()).toEqual(
      ["Abdul Samad MJ", "Abhiram NJ", "Ajzal P", "Anin Arafath", "Midlaj C", "Shaan Shoukath"],
    );
    expect(new Set(SAMPLE_CARDS.map((card) => card.organisation))).toEqual(new Set([SAMPLE_ORG]));
    expect(SAMPLE_ORG).toMatchObject({ name: "SpaceWorks", logo: "/brand/logo/symbol.svg" });
    expect(new Set(SAMPLE_CARDS.map((card) => card.orientation))).toEqual(new Set(["landscape", "portrait"]));
  });

  it("has the logo file and describes every card", () => {
    expect(existsSync(join(publicDir, SAMPLE_ORG.logo)), SAMPLE_ORG.logo).toBe(true);
    for (const card of SAMPLE_CARDS) {
      expect(card.alt).toBe(`SpaceWorks member card for ${card.name}, ${card.title}, drawn by Space Works Organization`);
    }
  });

  it("prints SpaceWorks card numbers, Shaan's first", () => {
    expect(Object.fromEntries(SAMPLE_CARDS.map((card) => [card.name, card.idNumber]))).toEqual({
      "Shaan Shoukath": "SWK-0001",
      "Abhiram NJ": "SWK-0002",
      "Abdul Samad MJ": "SWK-0003",
      "Midlaj C": "SWK-0004",
      "Ajzal P": "SWK-0005",
      "Anin Arafath": "SWK-0006",
    });
  });
});
