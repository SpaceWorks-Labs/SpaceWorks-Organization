#!/usr/bin/env node
/*
 * Syncs the member-card font library from Fontsource: checks each family's licence, picks a regular
 * and a bold weight, downloads the woff2 subsets into public/fonts/card/<id>/<subset>-<weight>.woff2
 * and writes lib/cards/card-fonts.json plus public/fonts/card/LICENSES.md.
 *
 *   node scripts/sync-card-fonts.mjs
 *
 * Downloaded files are untrusted data: they are only checked for the woff2 signature and written
 * under public/fonts/card/. Nothing from them is executed or interpreted here.
 */

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { create } from "fontkit";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "fonts", "card");
const CATALOGUE = path.join(ROOT, "lib", "cards", "card-fonts.json");
const API = "https://api.fontsource.org/v1/fonts";
const CDN = "https://cdn.jsdelivr.net/fontsource/fonts";
const LICENCES = { "OFL-1.1": "SIL Open Font License 1.1", "Apache-2.0": "Apache License 2.0", "UFL-1.0": "Ubuntu Font Licence 1.0" };
const WEIGHTS = [400, 700];
const CONCURRENCY = 6;

/** [id, label, category, extra subset]. Every family also gets `latin`. */
const SOURCES = [
  ["inter", "Inter", "sans"], ["poppins", "Poppins", "sans"], ["montserrat", "Montserrat", "sans"],
  ["roboto", "Roboto", "sans"], ["open-sans", "Open Sans", "sans"], ["lato", "Lato", "sans"],
  ["nunito", "Nunito", "sans"], ["raleway", "Raleway", "sans"], ["work-sans", "Work Sans", "sans"],
  ["dm-sans", "DM Sans", "sans"], ["manrope", "Manrope", "sans"], ["rubik", "Rubik", "sans"],
  ["outfit", "Outfit", "sans"], ["plus-jakarta-sans", "Plus Jakarta Sans", "sans"],
  ["space-grotesk", "Space Grotesk", "sans"], ["archivo", "Archivo", "sans"], ["barlow", "Barlow", "sans"],
  ["league-spartan", "League Spartan", "sans"], ["figtree", "Figtree", "sans"], ["sora", "Sora", "sans"],
  ["oswald", "Oswald", "display"], ["bebas-neue", "Bebas Neue", "display"], ["anton", "Anton", "display"],
  ["archivo-black", "Archivo Black", "display"], ["unbounded", "Unbounded", "display"],
  ["playfair-display", "Playfair Display", "serif"], ["merriweather", "Merriweather", "serif"],
  ["lora", "Lora", "serif"], ["eb-garamond", "EB Garamond", "serif"],
  ["libre-baskerville", "Libre Baskerville", "serif"], ["crimson-pro", "Crimson Pro", "serif"],
  ["dm-serif-display", "DM Serif Display", "serif"], ["cormorant-garamond", "Cormorant Garamond", "serif"],
  ["roboto-slab", "Roboto Slab", "serif"], ["zilla-slab", "Zilla Slab", "serif"], ["bitter", "Bitter", "serif"],
  ["fraunces", "Fraunces", "serif"],
  ["abril-fatface", "Abril Fatface", "display"], ["alfa-slab-one", "Alfa Slab One", "display"],
  ["righteous", "Righteous", "display"], ["bungee", "Bungee", "display"], ["lobster", "Lobster", "display"],
  ["fredoka", "Fredoka", "display"], ["baloo-2", "Baloo 2", "display"],
  ["pacifico", "Pacifico", "script"], ["dancing-script", "Dancing Script", "script"],
  ["great-vibes", "Great Vibes", "script"], ["caveat", "Caveat", "script"],
  ["permanent-marker", "Permanent Marker", "script"], ["satisfy", "Satisfy", "script"],
  ["kaushan-script", "Kaushan Script", "script"], ["sacramento", "Sacramento", "script"],
  ["jetbrains-mono", "JetBrains Mono", "mono"], ["ibm-plex-mono", "IBM Plex Mono", "mono"],
  ["space-mono", "Space Mono", "mono"],
  ["manjari", "Manjari", "indic", "malayalam"], ["baloo-chettan-2", "Baloo Chettan 2", "indic", "malayalam"],
  ["anek-malayalam", "Anek Malayalam", "indic", "malayalam"],
  ["noto-serif-malayalam", "Noto Serif Malayalam", "indic", "malayalam"],
  ["chilanka", "Chilanka", "indic", "malayalam"], ["gayathri", "Gayathri", "indic", "malayalam"],
  ["hind", "Hind", "indic", "devanagari"], ["mukta", "Mukta", "indic", "devanagari"],
  ["tiro-devanagari-hindi", "Tiro Devanagari Hindi", "indic", "devanagari"],
  ["noto-serif-devanagari", "Noto Serif Devanagari", "indic", "devanagari"],
  ["yatra-one", "Yatra One", "indic", "devanagari"],
];
const CATEGORY_ORDER = ["sans", "serif", "display", "script", "mono", "indic"];

class Fatal extends Error {}

async function fetchRetry(url) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (response.status >= 500 && attempt < 3) continue;
      return response;
    } catch (error) {
      if (attempt >= 3) throw new Fatal(`${url}: ${error.message}`);
    }
  }
}

/** Fontsource reports the SPDX id as a string; tolerate an object shape ({ type | id | name }) too. */
function licenceId(licence) {
  if (typeof licence === "string") return licence.trim();
  if (licence && typeof licence === "object") return String(licence.type ?? licence.id ?? licence.name ?? "").trim();
  return "";
}

function nearest(available, target) {
  return [...available].sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || b - a)[0];
}

function pickWeights(available) {
  const regular = available.includes(WEIGHTS[0]) ? WEIGHTS[0] : nearest(available, WEIGHTS[0]);
  const bold = [WEIGHTS[1], 800, 600].find((weight) => available.includes(weight)) ?? regular;
  return { regular, bold };
}

async function download(url) {
  const response = await fetchRetry(url);
  if (!response.ok) throw new Fatal(`download failed (${response.status}): ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 100 || bytes.subarray(0, 4).toString("latin1") !== "wOF2") throw new Fatal(`not a woff2 file: ${url}`);
  return bytes;
}

async function syncFamily([id, label, category, extra]) {
  const response = await fetchRetry(`${API}/${id}`);
  if (response.status === 404) {
    console.warn(`warn: ${id} is not on Fontsource, skipped`);
    return null;
  }
  if (!response.ok) throw new Fatal(`${id}: metadata request failed (${response.status})`);
  const meta = await response.json();
  const license = licenceId(meta.license);
  if (!LICENCES[license]) throw new Fatal(`${id}: licence ${JSON.stringify(meta.license)} is not allowed`);
  if (!Array.isArray(meta.styles) || !meta.styles.includes("normal")) throw new Fatal(`${id}: no normal style`);
  const version = meta.npmVersion;
  if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) throw new Fatal(`${id}: unexpected npmVersion ${JSON.stringify(version)}`);
  const { regular, bold } = pickWeights(meta.weights);
  const subsetNames = ["latin", ...(extra ? [extra] : [])];
  const files = [];
  const subsets = subsetNames.map((name) => {
    const unicodeRange = meta.unicodeRange?.[name];
    if (!meta.subsets.includes(name) || !unicodeRange) throw new Fatal(`${id}: subset ${name} not available`);
    for (const weight of new Set([regular, bold])) files.push({ name, weight });
    return { name, unicodeRange };
  });
  const fetched = await Promise.all(
    files.map(async ({ name, weight }) => ({ file: `${name}-${weight}.woff2`, bytes: await download(`${CDN}/${id}@${version}/${name}-${weight}-normal.woff2`) })),
  );
  const dir = path.join(OUT_DIR, id);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (const { file, bytes } of fetched) await writeFile(path.join(dir, file), bytes);
  const size = fetched.reduce((sum, { bytes }) => sum + bytes.length, 0);
  console.log(`${id}: ${license} ${version} regular ${regular} bold ${bold}${bold === regular ? " (= regular)" : ""}, ${fetched.length} files, ${(size / 1024).toFixed(0)} KiB`);
  return { entry: { id, label, category, regular, bold, subsets, license, version }, family: meta.family, type: meta.type };
}

async function run() {
  if (new Set(SOURCES.map(([id]) => id)).size !== SOURCES.length) throw new Fatal("duplicate id in SOURCES");
  for (const [id, , category] of SOURCES) {
    if (!/^[a-z0-9-]{2,40}$/.test(id)) throw new Fatal(`bad id ${id}`);
    if (!CATEGORY_ORDER.includes(category)) throw new Fatal(`${id}: bad category ${category}`);
  }
  await mkdir(OUT_DIR, { recursive: true });
  const results = [];
  const queue = [...SOURCES];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const result = await syncFamily(queue.shift());
        if (result) results.push(result);
      }
    }),
  );
  results.sort((a, b) => CATEGORY_ORDER.indexOf(a.entry.category) - CATEGORY_ORDER.indexOf(b.entry.category) || a.entry.label.localeCompare(b.entry.label, "en"));

  const keep = new Set(results.map(({ entry }) => entry.id));
  for (const item of await readdir(OUT_DIR, { withFileTypes: true })) {
    if (item.isDirectory() && !keep.has(item.name)) await rm(path.join(OUT_DIR, item.name), { recursive: true, force: true });
  }

  const catalogue = { source: "fontsource", families: results.map(({ entry }) => entry) };
  await writeFile(CATALOGUE, `${JSON.stringify(catalogue, null, 2)}\n`);

  const lines = await Promise.all(results.map(async ({ entry, family, type }) => {
    const sources = [`https://fontsource.org/fonts/${entry.id}`];
    if (type === "google") sources.push(`https://fonts.google.com/specimen/${encodeURIComponent(family).replaceAll("%20", "+")}`);
    // The family's own copyright notice, from the font's name table.
    const copyright = create(await readFile(path.join(OUT_DIR, entry.id, `latin-${entry.regular}.woff2`))).copyright?.trim();
    return `- ${entry.label}: ${entry.license} (${LICENCES[entry.license]}).${copyright ? ` ${copyright}` : ""} Source: ${sources.join(", ")}`;
  }));
  const notice = [
    "# Card font licences",
    "",
    "The fonts in this folder are third-party typefaces downloaded from Fontsource",
    "(https://fontsource.org), which republishes them from Google Fonts. They are not covered by this",
    "project's licence: each family is redistributed under its own open licence, the SIL Open Font",
    "License 1.1 (https://openfontlicense.org) or the Apache License 2.0",
    "(https://www.apache.org/licenses/LICENSE-2.0), as listed below with each family's copyright",
    "notice. The licence texts are OFL.txt and Apache-2.0.txt in this folder. Regenerate with",
    "`node scripts/sync-card-fonts.mjs`.",
    "",
    ...lines,
    "",
  ];
  await writeFile(path.join(OUT_DIR, "LICENSES.md"), notice.join("\n"));
  // The licence texts themselves: the OFL from the Noto copy already shipped, the Apache licence from apache.org.
  const ofl = await readFile(path.join(ROOT, "public", "fonts", "noto", "OFL.txt"), "utf8");
  await writeFile(path.join(OUT_DIR, "OFL.txt"), ofl.slice(ofl.indexOf("This Font Software is licensed")));
  const apache = await fetchRetry("https://www.apache.org/licenses/LICENSE-2.0.txt");
  if (!apache.ok) throw new Fatal(`Apache licence text: HTTP ${apache.status}`);
  await writeFile(path.join(OUT_DIR, "Apache-2.0.txt"), (await apache.text()).replace(/\r\n/g, "\n"));
  console.log(`\n${results.length} families written to ${path.relative(ROOT, CATALOGUE)}`);
}

run().catch((error) => {
  console.error(error instanceof Fatal ? `error: ${error.message}` : error);
  process.exit(1);
});
