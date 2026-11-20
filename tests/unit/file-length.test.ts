import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/** Owner rule: no source file over 300 lines. Split by responsibility instead. */
const LIMIT = 300;
const root = join(import.meta.dirname, "../..");
const SOURCE_DIRS = ["app", "components", "lib", "scripts", "tests", "frontend", "prisma"];
const EXTENSIONS = /\.(ts|tsx|mjs|js|css|sh)$/;
/** Generated or copied at build time; never edited by hand. */
const SKIP = [
  "lib/frontend/registry.ts",
  "lib/docs/content.ts",
  "app/styles/tokens.css",
  `frontend${sep}app`,
  `frontend${sep}components`,
  `frontend${sep}lib`,
  `frontend${sep}public`,
  `frontend${sep}.next`,
  "node_modules",
];

function walk(dir: string, files: string[] = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const rel = relative(root, path);
    if (SKIP.some((skip) => rel === skip.replaceAll("/", sep) || rel.startsWith(skip.replaceAll("/", sep) + sep) || rel.startsWith(skip))) continue;
    if (statSync(path).isDirectory()) walk(path, files);
    else if (EXTENSIONS.test(name)) files.push(rel);
  }
  return files;
}

describe("file length", () => {
  it(`keeps every source file at ${LIMIT} lines or fewer`, () => {
    const tooLong = SOURCE_DIRS.flatMap((dir) => walk(join(root, dir)))
      .map((file) => ({ file, lines: readFileSync(join(root, file), "utf8").replace(/\n$/, "").split("\n").length }))
      .filter(({ lines }) => lines > LIMIT);
    expect(tooLong).toEqual([]);
  });
});
