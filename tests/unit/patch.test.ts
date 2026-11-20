import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandPageLoader } from "@/components/brand/BrandLoader";
import { PATCH_FRAME, Patch, patchClearSpace } from "@/components/brand/Patch";
import { EmptyState } from "@/components/ui/display";
import { PET_EDGE, petMaxX, petStart, petStride, petTarget } from "@/lib/patch/pet";

const root = process.cwd();
const css = readFileSync(path.join(root, "app", "styles", "patch.css"), "utf8");

describe("Patch artwork", () => {
  it("ships every sheet the CSS draws from", () => {
    const urls = [...css.matchAll(/url\("(\/brand\/patch\/[^"]+)"\)/g)].map(([, url]) => url);
    expect(new Set(urls)).toEqual(new Set(["/brand/patch/patch-poses.webp", "/brand/patch/patch-walk-right.webp", "/brand/patch/patch-walk-left.webp"]));
    for (const url of urls) expect(existsSync(path.join(root, "public", url)), url).toBe(true);
  });

  it("stills every pose, the pet and its trails under reduced motion", () => {
    const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.sw-patch-sprite,\s*\.sw-pet,\s*\.sw-pet-sprite \{ animation: none !important; \}/);
    expect(reduced).toMatch(/\.sw-pet-zzz,\s*\.sw-pet-heart,\s*\.sw-pet-paw \{ display: none; \}/);
  });
});

describe("Patch", () => {
  it("is decorative by default, with a quarter of its badge as clear space", () => {
    const html = renderToStaticMarkup(createElement(Patch, { size: 96 }));
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-pose="idle"');
    expect(html).toContain(`padding:${patchClearSpace(96)}px`);
    expect(html).toContain("width:96px");
  });

  it("is never drawn past the artwork's native size", () => {
    expect(renderToStaticMarkup(createElement(Patch, { size: 999 }))).toContain(`width:${PATCH_FRAME.pose}px`);
    expect(renderToStaticMarkup(createElement(Patch, { pose: "walk", size: 999 }))).toContain(`width:${PATCH_FRAME.walk.width}px`);
  });

  it("becomes an image when it carries meaning", () => {
    const html = renderToStaticMarkup(createElement(Patch, { pose: "sneeze", label: "Patch sneezes" }));
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Patch sneezes"');
    expect(html).not.toContain("aria-hidden");
  });

  it("greets first-time empty lists instead of the mood tile, and keeps Patch away from the box loader", () => {
    const empty = renderToStaticMarkup(createElement(EmptyState, { patch: true, mood: "sleepy", title: "No members yet" }));
    expect(empty).toContain("sw-patch");
    expect(empty).not.toContain("sw-face");
    const loader = renderToStaticMarkup(createElement(BrandPageLoader, {}));
    // Patch is never put beside the box logo: the page loader is the box alone (components/brand/LogoLoader.tsx).
    expect(loader).not.toContain("sw-patch");
    expect(loader).toContain("sw-box loop");
    expect(loader).toContain('role="status"');
  });
});

describe("404 pet", () => {
  it("sits still near the right edge, facing in, under reduced motion", () => {
    expect(petStart(true, 1200, 104)).toEqual({ x: petMaxX(1200, 104) - 8, facing: "left", state: "sit" });
    expect(petStart(false, 1200, 104)).toEqual({ x: 216, facing: "right", state: "sit" });
  });

  it("never leaves the window", () => {
    expect(petTarget(-50, 800, 100)).toBe(PET_EDGE);
    expect(petTarget(5_000, 800, 100)).toBe(800 - 100 - PET_EDGE);
    expect(petMaxX(50, 100)).toBe(PET_EDGE);
  });

  it("runs to far targets, walks to near ones and sits when it arrives", () => {
    expect(petStride(500, 1)).toEqual({ state: "run", move: 7.5 });
    expect(petStride(-40, 1).state).toBe("walk");
    expect(petStride(-40, 1).move).toBeCloseTo(-2.4);
    expect(petStride(1.5, 1)).toEqual({ state: "sit", move: 0 });
    // A slow frame never overshoots the target.
    expect(petStride(3, 40)).toEqual({ state: "walk", move: 3 });
  });
});
