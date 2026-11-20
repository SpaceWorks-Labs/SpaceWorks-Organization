#!/usr/bin/env node
// Draws the README artwork in docs/readme/ (design-system product rules §12.3 and §12.6), then commit the outputs:
//
//   node scripts/generate-readme-art.mjs
//
// 1. banner-light.svg and banner-dark.svg: the rounded brand banner, 1280 × 320 with a 28 px corner radius, laid out
//    like the design system's own (brand/readme/make-banner.py, DS-1): the unaltered lockup from public/brand/logo,
//    the product name in Gilroy ExtraBold and the line under it in Outfit 400 (the card library's static cut; fontkit cannot instance the variable WOFF2), both turned into outlined paths so
//    GitHub shows the brand type without fonts. Light is Warm Cream, dark is solid black. The art is a fan of member
//    cards in the brand colours, which are the same in both themes. Patch stays off the banner: it never sits beside
//    the box logo.
// 2. screens/<area>-light.webp and -dark.webp: the README gallery, copied from the landing and docs captures in
//    public/screens (scripts/capture-screens.mjs, seeded demo data), so the README never shows a hand-edited image.
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { create } from "fontkit";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = (...parts) => path.join(root, "docs", "readme", ...parts);
const asset = (...parts) => path.join(root, "public", "brand", ...parts);

/** The README gallery, in the order "A look around" shows it. */
export const README_SCREENS = ["public-page", "plans-and-join-forms", "members", "groupings", "member-cards", "units", "reports-and-analytics", "renewals"];

const THEMES = {
  light: { bg: "#FFF4E8", ink: "#142C2A", sub: "#3E5654", edge: "#142C2A", edgeOpacity: 0.18, lockup: "lockup-horizontal.svg" },
  dark: { bg: "#000000", ink: "#FFF4E8", sub: "#C8C8C8", edge: "#3A3A3A", edgeOpacity: 1, lockup: "lockup-horizontal-reversed.svg" },
};
const TITLE = "Organization";
const LINES = ["Membership software for clubs, associations,", "alumni bodies and federations. Free and open source."];

const num = (value) => Number(value.toFixed(2)).toString();

/** Outlines `text` with its baseline at (x, y); fontkit applies the font's kerning. */
function outline(font, text, size, x, y, tracking = 0) {
  const scale = size / font.unitsPerEm;
  const run = font.layout(text);
  let pen = x;
  return run.glyphs.map((glyph, index) => {
    const d = glyph.path.scale(scale, -scale).translate(pen, y).toSVG();
    pen += run.positions[index].xAdvance * scale + tracking;
    return d;
  }).join("").replace(/-?\d+\.\d+/g, (value) => num(Number(value)));
}

/** The lockup master without its outer element, nested at the banner's position. */
async function lockup(file, id) {
  const svg = (await readFile(asset("logo", file), "utf8")).replace(/\r\n/g, "\n").trim();
  const inner = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "").replace(/clip0_2_\d+/g, id);
  return `<svg x="80" y="60" width="285" height="46" viewBox="0 0 360 58" fill="none">${inner}</svg>`;
}

/** One member card: photo, name and detail lines, and a QR block, in the card's own colours. */
function card({ x, y, angle, fill, ink, edge, edgeOpacity }) {
  const w = 228, h = 144, cx = x + w / 2, cy = y + h / 2;
  const qr = [[0, 0], [0, 2], [2, 0], [1, 1], [2, 2], [1, 2]].map(([col, row]) => `<rect x="${x + 168 + col * 12}" y="${y + 84 + row * 12}" width="10" height="10" rx="2" fill="${ink}"/>`).join("");
  return `<g transform="rotate(${angle} ${cx} ${cy})">
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${fill}" stroke="${edge}" stroke-opacity="${edgeOpacity}"/>
<circle cx="${x + 44}" cy="${y + 50}" r="22" fill="${ink}" fill-opacity="0.18"/>
<rect x="${x + 78}" y="${y + 36}" width="104" height="11" rx="5.5" fill="${ink}"/>
<rect x="${x + 78}" y="${y + 56}" width="72" height="8" rx="4" fill="${ink}" fill-opacity="0.45"/>
<rect x="${x + 22}" y="${y + 96}" width="88" height="8" rx="4" fill="${ink}" fill-opacity="0.45"/>
<rect x="${x + 22}" y="${y + 112}" width="60" height="8" rx="4" fill="${ink}" fill-opacity="0.45"/>
${qr}
</g>`;
}

async function banner(name, theme, title, body) {
  const t = THEMES[name];
  const edges = { edge: t.edge, edgeOpacity: t.edgeOpacity };
  const cards = [
    card({ x: 810, y: 70, angle: -9, fill: "#006E63", ink: "#FFF4E8", ...edges }),
    card({ x: 890, y: 92, angle: 3, fill: "#B5CDFF", ink: "#142C2A", ...edges }),
    card({ x: 960, y: 112, angle: 12, fill: "#DFFF8F", ink: "#142C2A", ...edges }),
  ].join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="320" viewBox="0 0 1280 320" role="img" aria-labelledby="t d">
<title id="t">Space Works Organization</title>
<desc id="d">Space Works Organization. ${LINES.join(" ")}</desc>
<defs><clipPath id="card"><rect width="1280" height="320" rx="28"/></clipPath></defs>
<g clip-path="url(#card)">
<rect width="1280" height="320" fill="${t.bg}"/>
${await lockup(t.lockup, `lk-${name}`)}
<path fill="${t.ink}" d="${outline(title, TITLE, 56, 80, 188, -1.5)}"/>
<path fill="${t.sub}" d="${outline(body, LINES[0], 20, 80, 236)}${outline(body, LINES[1], 20, 80, 262)}"/>
${cards}
</g>
</svg>
`;
}

async function main() {
  const title = create(await readFile(asset("fonts", "Gilroy-ExtraBold.woff2")));
  const body = create(await readFile(path.join(root, "public", "fonts", "card", "outfit", "latin-400.woff2")));
  await mkdir(out("screens"), { recursive: true });
  for (const name of Object.keys(THEMES)) {
    const svg = await banner(name, THEMES[name], title, body);
    await writeFile(out(`banner-${name}.svg`), svg);
    console.log(`docs/readme/banner-${name}.svg`, Buffer.byteLength(svg), "bytes");
  }
  for (const area of README_SCREENS) {
    for (const theme of ["light", "dark"]) await copyFile(path.join(root, "public", "screens", `${area}-${theme}.webp`), out("screens", `${area}-${theme}.webp`));
  }
  console.log(`docs/readme/screens: ${README_SCREENS.length * 2} images`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
