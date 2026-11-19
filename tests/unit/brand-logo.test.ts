import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandLoader, BrandPageLoader } from "@/components/brand/BrandLoader";
import { BoxSpinner } from "@/components/brand/BoxSpinner";
import { LogoLoader } from "@/components/brand/LogoLoader";
import { logoMasters } from "@/components/brand/boxOpen/logoPaths";
import { BOX_MARKUP } from "@/components/brand/boxOpen/markup";
import { BOX_CSS_HREF } from "@/components/brand/boxOpen/stylesheet";
import { SPACE_WORKS_LOGO_ARTWORK, SpaceWorksProductLogo, SpaceWorksLogo, spaceWorksLogoSize, spaceWorksLogoSrc, type SpaceWorksLogoTone, type SpaceWorksLogoVariant } from "@/components/brand/SpaceWorksLogo";

const root = process.cwd();
const render = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);
/** The outer artwork of each drawn master (the horizontal lockup's nested clip viewport lists width before viewBox). */
const masters = (html: string) =>
  [...html.matchAll(/<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="([^"]+)" width="(\d+)" height="(\d+)"[^>]*class="([^"]*)"/g)].map(([, viewBox, width, height, className]) => ({
    viewBox,
    width: Number(width),
    height: Number(height),
    className,
  }));

describe("SpaceWorksLogo", () => {
  it("maps every variant and tone to an unaltered master in public/brand/logo", () => {
    const variants: SpaceWorksLogoVariant[] = ["symbol", "lockup-horizontal", "lockup-stacked"];
    const tones: SpaceWorksLogoTone[] = ["full", "reversed", "ink"];
    for (const variant of variants) {
      for (const tone of tones) {
        const src = spaceWorksLogoSrc(variant, tone);
        const file = path.join(root, "public", src);
        expect(existsSync(file), src).toBe(true);
        const { width, height } = SPACE_WORKS_LOGO_ARTWORK[variant];
        expect(readFileSync(file, "utf8")).toContain(`viewBox="0 0 ${width} ${height}"`);
        const key = (tone === "full" ? variant : `${variant}-${tone === "ink" ? "one-colour-ink" : "reversed"}`) as keyof typeof logoMasters;
        expect(logoMasters[key].viewBox, key).toBe(`0 0 ${width} ${height}`);
      }
    }
    expect(spaceWorksLogoSrc("symbol", "ink")).toBe("/brand/logo/symbol-one-colour-ink.svg");
    expect(spaceWorksLogoSrc("app-icon", "reversed")).toBe("/brand/logo/app-icon.svg");
  });

  it("is one image named Space Works, or decorative when labelled null", () => {
    const html = render(createElement(SpaceWorksLogo, { variant: "symbol" }));
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Space Works"');
    const decorative = render(createElement(SpaceWorksLogo, { variant: "symbol", label: null }));
    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative).not.toContain("role=");
  });

  it("never draws the symbol under 48px or a lockup under 180px wide", () => {
    expect(spaceWorksLogoSize("symbol", 20).height).toBe(48);
    expect(spaceWorksLogoSize("lockup-horizontal", 10).width).toBeGreaterThanOrEqual(180);
    expect(spaceWorksLogoSize("lockup-stacked", 10).width).toBeGreaterThanOrEqual(180);
    expect(spaceWorksLogoSize("app-icon", 16)).toEqual({ width: 16, height: 16 });
    const [svg] = masters(render(createElement(SpaceWorksLogo, { variant: "symbol", height: 12 })));
    expect(svg!.height).toBe(48);
    expect(svg!.width).toBe(Math.round((48 * 136) / 126));
  });

  it("draws a reversed twin for dark mode at the same size, unless the tone is fixed", () => {
    const pair = masters(render(createElement(SpaceWorksLogo, { variant: "lockup-horizontal", height: 40 })));
    expect(pair).toHaveLength(2);
    expect(pair.map((svg) => svg.className)).toEqual(["block max-w-none shrink-0 dark:hidden", "max-w-none shrink-0 hidden dark:block"]);
    expect(pair[0]!.width).toBe(pair[1]!.width);
    expect(masters(render(createElement(SpaceWorksLogo, { variant: "symbol", adaptive: false })))).toHaveLength(1);
    expect(masters(render(createElement(SpaceWorksLogo, { variant: "symbol", tone: "reversed" })))).toHaveLength(1);
  });

  it("keeps the CR-LOGO-01 flap colours on the light mark: top-left and bottom-right green, top-right and bottom-left orange", () => {
    const html = render(createElement(SpaceWorksLogo, { variant: "symbol", adaptive: false }));
    const flap = (corner: string) => new RegExp(`fill="(#[0-9A-F]{6})" d="[^"]+" class="sw-logo-sym sw-logo-flap sw-logo-flap-${corner}"`).exec(html)?.[1];
    expect([flap("tl"), flap("tr"), flap("bl"), flap("br")]).toEqual(["#006E63", "#FF7447", "#FF7447", "#006E63"]);
  });

  it("lays the hover overlay over the symbol only, and draws the app icon as a still image", () => {
    const html = render(createElement(SpaceWorksLogo, { variant: "symbol", height: 48 }));
    expect(html).toContain('class="sw-logo-box"');
    // At rest no box artwork is mounted: the overlay fills only while the cycle plays.
    expect(html).not.toContain("sw-box hov");
    const icon = render(createElement(SpaceWorksLogo, { variant: "app-icon", height: 32 }));
    expect(icon).toContain('<img src="/brand/logo/app-icon.svg"');
    expect(icon).not.toContain("sw-logo-box");
  });

  it("adds clear space of a quarter of the logo height when asked", () => {
    expect(render(createElement(SpaceWorksLogo, { variant: "symbol", height: 48, clearSpace: true }))).toContain("padding:12px");
  });

  it("pairs the lockup with an Organization label for product headers", () => {
    const html = render(createElement(SpaceWorksProductLogo, {}));
    expect(html).toContain('aria-label="Space Works Organization"');
    expect(html).toContain(">Organization</span>");
    expect(masters(html)[0]!.width).toBeGreaterThanOrEqual(180);
  });
});

describe("box loader", () => {
  it("ships the kit artwork: light, reversed and coloured SVGs, and the full keyframes as a static file", () => {
    expect([...BOX_MARKUP.matchAll(/<svg class="(\w+)"/g)].map(([, name]) => name)).toEqual(["lt", "dk", "colour"]);
    const css = readFileSync(path.join(root, "public", BOX_CSS_HREF), "utf8");
    for (const keyframes of ["sw-boxl-tl", "sw-boxh-w", "sw-box412h-w"]) expect(css).toContain(`@keyframes ${keyframes}`);
    expect(css).toMatch(/steps\(1,end\)/);
    const layout = readFileSync(path.join(root, "app", "styles", "motion-box.css"), "utf8");
    expect(layout).toContain(".sw-box .colour{display:none}");
    expect(layout).toContain("@media (prefers-reduced-motion:reduce){.sw-box .f");
    expect(layout).not.toContain("@keyframes sw-boxl-tl");
  });

  it("announces its label politely and loops the box", () => {
    const html = render(createElement(LogoLoader, { label: "Loading members" }));
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Loading members");
    expect(html).toContain("sw-box loop");
  });

  it("keeps BrandLoader and the page loader on the box, without the old dots or Patch", () => {
    for (const html of [render(createElement(BrandLoader, { label: "Loading" })), render(createElement(BrandPageLoader, {}))]) {
      expect(html).toContain("sw-box loop");
      expect(html).toContain('role="status"');
      expect(html).not.toMatch(/sw-dot-loader-jump|data-pose/);
    }
  });

  it("draws the compact spinner in the text colour when mono", () => {
    const html = render(createElement(BoxSpinner, { label: "Saving", mono: true }));
    expect(html).toContain("sw-box loop");
    expect(html).toContain(" mono");
    expect(html).toContain("Saving");
  });
});
