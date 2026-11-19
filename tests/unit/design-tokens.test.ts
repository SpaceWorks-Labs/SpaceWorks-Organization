import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tokens = readFileSync("app/styles/tokens.css", "utf8");
const globals = readFileSync("app/globals.css", "utf8");
const semantic = readFileSync("app/styles/semantic.css", "utf8");
const charts = readFileSync("app/styles/charts.css", "utf8");
const motion = readFileSync("app/styles/motion.css", "utf8");

describe("design tokens", () => {
  it("re-emits the kit with an --sw- prefix and no Tailwind --color-* or bare chart names", () => {
    expect(tokens).toMatch(/--sw-color-accent: 0 110 99;/);
    expect(tokens).toContain(":root.dark {");
    expect(tokens).not.toMatch(/^\s*--(color|chart)-/m);
    expect(tokens).not.toMatch(/var\(--(color|chart)-/);
  });

  it("brings through every kit rule: the black dark family, scrim, motion, reduced motion, kiosk and charts", () => {
    expect(tokens).toMatch(/:root\.dark \{[^}]*--sw-color-bg: 0 0 0;[^}]*--sw-color-panel: 20 20 20;/);
    expect(tokens).toMatch(/--sw-color-scrim: 20 44 42;/);
    expect(tokens).toMatch(/--sw-dur-fast: 120ms;[\s\S]*--sw-dur-base: 180ms;[\s\S]*--sw-dur-slow: 240ms;/);
    expect(tokens).toContain("--sw-ease-standard: cubic-bezier(0.2, 0, 0, 1);");
    expect(tokens).toContain("@media (prefers-reduced-motion: reduce)");
    expect(tokens).toContain(".sw-kiosk, .sw-tv {");
    expect(tokens).toMatch(/--sw-chart-5: 255 212 71;/);
    expect(tokens).toContain("--sw-chart-danger: var(--sw-color-danger);");
    expect(tokens).not.toContain("@font-face");
  });

  it("removes Tailwind's default palette and maps every role onto the kit", () => {
    expect(globals).toContain("--color-*: initial;");
    expect(globals).toMatch(/--color-primary: rgb\(var\(--sw-ui-primary\)\);/);
    expect(globals).toMatch(/--radius-control: 10px;/);
    expect(globals).toContain("--color-scrim: rgb(var(--sw-color-scrim));");
  });

  it("consults the operating-system colour scheme only in the System boot script, never in CSS", () => {
    for (const css of [tokens, globals, semantic, charts, motion]) expect(css).not.toContain("prefers-color-scheme");
  });

  it("declares each font at its real weight: Outfit 400–700, Gilroy 300 and 800 only, Unbounded 500–600", () => {
    const faces = [...globals.matchAll(/src: url\("\/brand\/fonts\/([^"]+)"\)[^}]*font-weight: ([^;]+);/g)].map((match) => [match[1], match[2]]);
    expect(faces).toEqual([
      ["Outfit-Variable.woff2", "400 700"],
      ["Gilroy-Light.woff2", "300"],
      ["Gilroy-ExtraBold.woff2", "800"],
      ["Unbounded-Variable.woff2", "500 600"],
    ]);
    expect(globals).toMatch(/--font-sans: "Outfit"/);
    expect(globals).not.toMatch(/\.text-mono\b/);
  });

  it("charts use the five kit series and the edge, with no sixth slot", () => {
    for (let slot = 1; slot <= 5; slot += 1) expect(charts).toContain(`--chart-${slot}: rgb(var(--sw-chart-${slot}));`);
    expect(charts).toContain("--chart-edge: rgb(var(--sw-chart-edge));");
    expect(charts).not.toMatch(/--chart-6\b/);
  });

  it("scopes the dark band to light pages so a dark page keeps one black family", () => {
    expect(semantic).toContain(":root:not(.dark) .sw-dark-band");
    expect(semantic).not.toMatch(/^\.sw-dark-band/m);
  });
});
