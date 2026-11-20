import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { buildLogoSvg, safePathData } from "@/lib/logo/logoSvg";
import { LOGO_SHAPES, type LogoSpec } from "@/lib/logo/spec";

const STAR = "M12 2 L15 9 L22 9 L16 14 L18 21 L12 17 L6 21 L8 14 L2 9 L9 9 Z";

// The card icon set lives elsewhere; the renderer only needs one path from it here.
vi.mock("@/lib/logo/icons", () => ({
  logoIconPath: (id: string | null) => (id === "star" ? "M12 2 L15 9 L22 9 L16 14 L18 21 L12 17 L6 21 L8 14 L2 9 L9 9 Z" : null),
  LOGO_ICON_IDS: new Set(["star"]),
}));

const { renderLogoSvg } = await import("@/lib/logo/render");

const spec: LogoSpec = { text: "KMG", shape: "circle", background: "#006E63", foreground: "#FFFFFF", font: "gilroy", icon: null };
const font = { kind: "font" as const, fontFamily: '"SWO Card", Gilroy, sans-serif' };
const ALLOWED = new Set(["svg", "path", "circle", "rect", "g", "text"]);

const elements = (svg: string) => [...svg.matchAll(/<([a-zA-Z]+)/g)].map((match) => match[1]!);

describe("buildLogoSvg", () => {
  it("writes a 512 square SVG with only allowed elements, for every shape", () => {
    for (const shape of LOGO_SHAPES) {
      const svg = buildLogoSvg({ ...spec, shape, icon: "star" }, font, STAR);
      expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 512 512"/);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(elements(svg).every((name) => ALLOWED.has(name))).toBe(true);
      expect(svg).not.toMatch(/href|script|on[a-z]+=|style=/i);
    }
  });

  it("escapes text and the font family", () => {
    const svg = buildLogoSvg({ ...spec, text: `<b>&"'` }, { kind: "font", fontFamily: 'x" onload="alert(1)' }, null);
    expect(svg).toContain(">&lt;b&gt;&amp;&quot;&#39;</text>");
    expect(svg).toContain('font-family="x&quot; onload=&quot;alert(1)"');
    expect(elements(svg)).not.toContain("b");
  });

  it("never writes unsafe path data or colours", () => {
    expect(safePathData("M0 0 L10 10 Z")).toBe("M0 0 L10 10 Z");
    expect(safePathData('M0 0"/><script>alert(1)</script>')).toBe("");
    const svg = buildLogoSvg({ ...spec, text: "", icon: "star", background: 'red"/><script>', foreground: "#FFFFFF" }, font, 'M0 0"/><script>');
    expect(svg).not.toContain("script");
    expect(svg).toContain('fill="#000000"');
  });

  it("places an icon with text, and shrinks long browser text into the room", () => {
    const both = buildLogoSvg({ ...spec, icon: "star" }, font, STAR);
    expect(both).toContain('stroke-width="2"');
    expect(both).toContain(">KMG</text>");
    expect(buildLogoSvg({ ...spec, text: "Makers Guild" }, font, null)).toContain('lengthAdjust="spacingAndGlyphs"');
  });
});

describe("renderLogoSvg (server)", () => {
  it("draws the text as glyph outlines, with no <text> and no font family", async () => {
    const svg = await renderLogoSvg(spec);
    expect(svg).not.toContain("<text");
    expect(svg).not.toContain("font-family");
    expect((svg.match(/<path transform=/g) ?? []).length).toBe(3);
    expect(elements(svg).every((name) => ALLOWED.has(name))).toBe(true);
  });

  it("rasterises with sharp: the shape colour near the edge, the text colour in the middle of a letter", async () => {
    const svg = await renderLogoSvg({ ...spec, text: "I" });
    const { data, info } = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
    expect(at(256, 60)).toEqual([0, 110, 99]);
    expect(at(256, 256)).toEqual([255, 255, 255]);
    // Outside the circle stays transparent.
    expect(data[(2 * info.width + 2) * info.channels + 3]).toBe(0);
  });

  it("draws an icon-only logo", async () => {
    expect(await renderLogoSvg({ ...spec, text: "", icon: "star" })).toContain(STAR);
  });
});
