import { describe, expect, it } from "vitest";
import { BRAND_KIT_LIMITS, colourContrast, EMPTY_BRAND_KIT, mergeColours, normalizeBrandKit, normalizeHexColour } from "@/lib/cards/brandKit";
import { CARD_FONTS } from "@/lib/cards/fontCatalog";

const own = (url: string) => url.startsWith("/api/uploads/organisations/org_a/organisation-logos/");

describe("normalizeHexColour", () => {
  it("accepts short and long hex with or without #, upper-cased", () => {
    expect(normalizeHexColour("#abc")).toBe("#AABBCC");
    expect(normalizeHexColour("006e63")).toBe("#006E63");
    expect(normalizeHexColour(" #FF7447 ")).toBe("#FF7447");
  });

  it("refuses anything else", () => {
    for (const value of ["red", "#12345", "#1234567", "rgb(0,0,0)", "#GGGGGG", 42, null]) expect(normalizeHexColour(value)).toBeNull();
  });
});

describe("normalizeBrandKit", () => {
  it("returns the empty kit for nonsense", () => {
    expect(normalizeBrandKit(null)).toEqual(EMPTY_BRAND_KIT);
    expect(normalizeBrandKit([1, 2])).toEqual(EMPTY_BRAND_KIT);
    expect(normalizeBrandKit({ logos: "x", colours: 3, fonts: {} })).toEqual(EMPTY_BRAND_KIT);
  });

  it("keeps only the organisation's own logos, valid colours and catalogue fonts, without duplicates", () => {
    const kit = normalizeBrandKit(
      {
        logos: ["/api/uploads/organisations/org_a/organisation-logos/1.webp", "/api/uploads/organisations/org_b/organisation-logos/2.webp", "javascript:alert(1)", "/api/uploads/organisations/org_a/organisation-logos/1.webp"],
        colours: ["#006e63", "#006E63", "nope", "fff"],
        fonts: ["gilroy", "comic-sans", "gilroy"],
      },
      own,
    );
    expect(kit).toEqual({ logos: ["/api/uploads/organisations/org_a/organisation-logos/1.webp"], colours: ["#006E63", "#FFFFFF"], fonts: ["gilroy"] });
  });

  it("drops every logo when no ownership check is given", () => {
    expect(normalizeBrandKit({ logos: ["/api/uploads/organisations/org_a/organisation-logos/1.webp"] }).logos).toEqual([]);
  });

  it("caps colours at 12, fonts at 4 and logos at 8", () => {
    const colours = Array.from({ length: 20 }, (_, i) => `#0000${i.toString(16).padStart(2, "0")}`);
    const fonts = CARD_FONTS.slice(0, 7).map((font) => font.id);
    const logos = Array.from({ length: 12 }, (_, i) => `/api/uploads/organisations/org_a/organisation-logos/${i}.webp`);
    const kit = normalizeBrandKit({ colours, fonts, logos }, own);
    expect(kit.colours).toHaveLength(BRAND_KIT_LIMITS.colours);
    expect(kit.fonts).toHaveLength(BRAND_KIT_LIMITS.fonts);
    expect(kit.logos).toHaveLength(BRAND_KIT_LIMITS.logos);
  });

  it("merges extracted colours after the kit's own, up to the limit", () => {
    const kit = { ...EMPTY_BRAND_KIT, colours: ["#006E63"] };
    expect(mergeColours(kit, ["#006e63", "#FF7447"]).colours).toEqual(["#006E63", "#FF7447"]);
    const full = { ...EMPTY_BRAND_KIT, colours: Array.from({ length: 12 }, (_, i) => `#1111${i.toString(16).padStart(2, "0")}`) };
    expect(mergeColours(full, ["#FF7447"]).colours).toHaveLength(12);
  });
});

describe("colourContrast", () => {
  it("marks dark colours readable on white and light ones readable on Deep Ink", () => {
    expect(colourContrast("#142C2A")).toMatchObject({ readableOnWhite: true, readableOnDark: false });
    expect(colourContrast("#FFFFFF")).toMatchObject({ onWhite: 1, readableOnWhite: false, readableOnDark: true });
    expect(colourContrast("#DFFF8F")).toMatchObject({ readableOnWhite: false, readableOnDark: true });
  });

  it("uses the 4.5:1 threshold", () => {
    // Maker Teal is 5.9:1 on white; Workshop Orange is under 4.5:1 on both.
    expect(colourContrast("#006E63").readableOnWhite).toBe(true);
    expect(colourContrast("#FF7447")).toMatchObject({ readableOnWhite: false });
    expect(colourContrast("#000000").onWhite).toBe(21);
  });
});
