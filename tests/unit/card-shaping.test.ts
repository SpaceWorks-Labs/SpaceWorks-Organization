import { describe, expect, it } from "vitest";
import { loadCardFonts } from "@/lib/cards/fonts";
import { fitLine } from "@/lib/cards/text";

/** Card text shaping (lib/cards/fonts.ts) and one-line fitting (lib/cards/text.ts). */
describe("card text", () => {
  it("shapes Malayalam with a word-final chandrakkala, which fontkit's mark positioning trips on", async () => {
    const fonts = await loadCardFonts();
    for (const text of ["സമദ്", "അബ്ദുൾ സമദ്", "അംഗത്വ കാർഡ്", "ഷാൻ ഷൗക്കത്ത്"]) {
      for (const weight of [400, 700] as const) expect(fonts.shape(text, weight).glyphs.length, text).toBeGreaterThan(0);
    }
  });

  it("draws card numbers in figures of one width", async () => {
    const { measurer } = await loadCardFonts();
    const width = (text: string, tabular: boolean) => measurer.widthMm(text, 700, 10, 0, undefined, tabular);
    expect(width("1111", true)).toBeCloseTo(width("0000", true), 5);
    expect(width("1111", false)).toBeLessThan(width("0000", false));
  });

  it("shrinks a long line a little before it cuts it short with an ellipsis", async () => {
    const { measurer } = await loadCardFonts();
    const style = { sizePt: 8, weight: 400 as const, color: "#000000", lineHeight: 1.25 };
    expect(fitLine(measurer, "Secretary", 40, style)).toEqual({ text: "Secretary", sizePt: 8 });
    const shrunk = fitLine(measurer, "Full Stack Developer and Lead", 34, style);
    expect(shrunk.text).toBe("Full Stack Developer and Lead");
    expect(shrunk.sizePt).toBeLessThan(8);
    const cut = fitLine(measurer, "Full Stack Developer, Community Lead and Treasurer of the Kozhikode unit", 40, style);
    expect(cut.sizePt).toBe(6);
    expect(cut.text.endsWith("…")).toBe(true);
    expect(measurer.widthMm(cut.text, 400, cut.sizePt)).toBeLessThanOrEqual(40);
  });
});
