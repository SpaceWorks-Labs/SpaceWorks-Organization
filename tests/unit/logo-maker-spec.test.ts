import { describe, expect, it } from "vitest";
import { clampCrop, cropRect, minZoom } from "@/lib/logo/crop";
import { initialsFrom, logoTextLength, validateLogoSpec } from "@/lib/logo/spec";

const ICONS = new Set(["star", "leaf"]);
const base = { text: "KMG", shape: "circle", background: "#006E63", foreground: "#FFFFFF", font: "gilroy", icon: null };

describe("validateLogoSpec", () => {
  it("accepts a valid spec and normalises text and colours", () => {
    expect(validateLogoSpec({ ...base, text: "  Kerala   Club ", background: "#006e63" }, ICONS)).toEqual({ ok: true, spec: { ...base, text: "Kerala Club", background: "#006E63" } });
  });

  it("accepts an icon on its own, and initials in other scripts", () => {
    expect(validateLogoSpec({ ...base, text: "", icon: "star" }, ICONS).ok).toBe(true);
    expect(validateLogoSpec({ ...base, text: "കമ" }, ICONS).ok).toBe(true);
    expect(validateLogoSpec({ ...base, text: "नमस्ते" }, ICONS).ok).toBe(true);
  });

  it("needs text or an icon", () => {
    expect(validateLogoSpec({ ...base, text: "   " }, ICONS)).toEqual({ ok: false, error: "Type initials or a short name, or choose an icon." });
  });

  it("refuses long text, markup and control characters", () => {
    for (const text of ["ABCDEFGHIJKLM", "<script>", 'A"B', "A\u0000B", "a/b", "{x}"]) expect(validateLogoSpec({ ...base, text }, ICONS).ok).toBe(false);
  });

  it("refuses unknown shapes, icons and fonts, and bad colours", () => {
    expect(validateLogoSpec({ ...base, shape: "star" }, ICONS).ok).toBe(false);
    expect(validateLogoSpec({ ...base, icon: "skull" }, ICONS)).toEqual({ ok: false, error: "Choose an icon from the list." });
    expect(validateLogoSpec({ ...base, font: "papyrus" }, ICONS).ok).toBe(false);
    expect(validateLogoSpec({ ...base, background: "red" }, ICONS).ok).toBe(false);
    expect(validateLogoSpec({ ...base, foreground: '#FFF" onload="x' }, ICONS).ok).toBe(false);
  });

  it("refuses colours under 3:1", () => {
    expect(validateLogoSpec({ ...base, background: "#FFFFFF", foreground: "#FFF4E8" }, ICONS)).toEqual({ ok: false, error: "Choose colours with more contrast, so the logo reads at small sizes." });
  });

  it("refuses non-objects", () => {
    for (const value of [null, "x", [], 3]) expect(validateLogoSpec(value, ICONS)).toEqual({ ok: false, error: "Invalid request." });
  });
});

describe("initials", () => {
  it("takes the first letter of up to four words", () => {
    expect(initialsFrom("Kerala Makers Guild")).toBe("KMG");
    expect(initialsFrom("the open source society of india")).toBe("TOSS");
    expect(initialsFrom("  (Bright) Club & Co ")).toBe("BCC");
  });

  it("counts characters as people do", () => {
    expect(logoTextLength("नमस्ते")).toBe(3);
    expect(logoTextLength("AB")).toBe(2);
  });
});

describe("crop", () => {
  const wide = { width: 400, height: 200 };

  it("covers the frame at zoom 1 and keeps the image over it", () => {
    expect(clampCrop({ zoom: 1, x: 500, y: 50 }, wide, 100)).toEqual({ zoom: 1, x: 50, y: 0 });
    expect(cropRect({ zoom: 1, x: 0, y: 0 }, wide, 100, 800)).toEqual({ x: -400, y: 0, width: 1600, height: 800 });
  });

  it("zooms out until the whole image fits, and no further", () => {
    expect(minZoom(wide)).toBe(0.5);
    const state = clampCrop({ zoom: 0.1, x: 0, y: 0 }, wide, 100);
    expect(state.zoom).toBe(0.5);
    expect(cropRect(state, wide, 100, 800)).toEqual({ x: 0, y: 200, width: 800, height: 400 });
  });

  it("caps zoom at 4", () => {
    expect(clampCrop({ zoom: 9, x: 0, y: 0 }, wide, 100).zoom).toBe(4);
  });
});
