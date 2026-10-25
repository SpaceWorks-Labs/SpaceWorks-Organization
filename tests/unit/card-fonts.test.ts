import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { create } from "fontkit";
import { describe, expect, it } from "vitest";

/*
 * The card font library (scripts/sync-card-fonts.mjs): every family in lib/cards/card-fonts.json has its
 * woff2 files on disk, each parses as a single fontkit font, and the subsets cover what they claim.
 */

type Family = {
  id: string;
  label: string;
  category: string;
  regular: number;
  bold: number;
  subsets: Array<{ name: string; unicodeRange: string }>;
  license: string;
  version: string;
};

const root = join(import.meta.dirname, "../..");
const catalogue = JSON.parse(readFileSync(join(root, "lib/cards/card-fonts.json"), "utf8")) as { source: string; families: Family[] };
const CATEGORIES = ["sans", "serif", "display", "script", "mono", "indic"];
const SAMPLES: Record<string, number[]> = { latin: [0x41, 0x61], malayalam: [0x0d15], devanagari: [0x0915] };

function fontFile(family: Family, subset: string, weight: number) {
  return join(root, "public/fonts/card", family.id, `${subset}-${weight}.woff2`);
}

describe("card font catalogue", () => {
  it("lists at least 45 open-licensed families with safe, unique ids", () => {
    expect(catalogue.source).toBe("fontsource");
    expect(catalogue.families.length).toBeGreaterThanOrEqual(45);
    const ids = catalogue.families.map((family) => family.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const family of catalogue.families) {
      expect(family.id).toMatch(/^[a-z0-9-]{2,40}$/);
      expect(CATEGORIES).toContain(family.category);
      expect(["OFL-1.1", "Apache-2.0", "UFL-1.0"]).toContain(family.license);
      expect(family.subsets[0]?.name).toBe("latin");
      if (family.category === "indic") expect(family.subsets.map((subset) => subset.name)).toHaveLength(2);
    }
  });

  it("names every family in the licence notice", () => {
    const notice = readFileSync(join(root, "public/fonts/card/LICENSES.md"), "utf8");
    for (const family of catalogue.families) expect(notice).toContain(`- ${family.label}: ${family.license}`);
  });

  describe.each(catalogue.families.map((family) => [family.id, family] as const))("%s", (_id, family) => {
    for (const subset of family.subsets) {
      for (const weight of new Set([family.regular, family.bold])) {
        it(`${subset.name} ${weight} parses and covers its script`, () => {
          const file = fontFile(family, subset.name, weight);
          expect(existsSync(file)).toBe(true);
          const font = create(readFileSync(file));
          expect("layout" in font).toBe(true);
          if (!("layout" in font)) return;
          for (const codePoint of SAMPLES[subset.name] ?? []) expect(font.hasGlyphForCodePoint(codePoint)).toBe(true);
        });
      }
    }
  });
});
