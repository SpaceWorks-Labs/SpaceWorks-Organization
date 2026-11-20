export type DocHeading = { id: string; title: string; level: 2 | 3 | 4; line: number };

/** Plain text of a heading's markdown, for its label and id. */
function headingText(raw: string) {
  return raw.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[`*_]/g, "").trim();
}

function slugifyHeading(text: string) {
  return text.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
}

/**
 * The h2 to h4 headings of a doc with stable ids (repeats get -2, -3) and their 1-based source line. The same rules
 * as scripts/docs/markdown.mjs, which builds the search index and checks links against these ids.
 */
export function extractHeadings(markdown: string): DocHeading[] {
  const seen = new Map<string, number>();
  const found: DocHeading[] = [];
  let fence = false;
  markdown.split("\n").forEach((line, index) => {
    if (/^```/.test(line)) fence = !fence;
    if (fence) return;
    const match = /^(#{2,4})\s+(.+?)\s*#*$/.exec(line);
    if (!match) return;
    const title = headingText(match[2]);
    const base = slugifyHeading(title);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    found.push({ id: count === 1 ? base : `${base}-${count}`, title, level: match[1].length as 2 | 3 | 4, line: index + 1 });
  });
  return found;
}
