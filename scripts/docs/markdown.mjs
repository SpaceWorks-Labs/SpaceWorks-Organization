// Plain-text helpers shared by the docs build: titles, summaries, heading ids and short excerpts.
// Heading ids must match lib/docs/headings.ts exactly (tests/unit/docs-build.test.ts checks both).

const SUMMARY_MAX = 180;
const EXCERPT_MAX = 140;

export function plain(text) {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(text, max) {
  return text.length > max ? `${text.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : text;
}

/** First h1 as the title, first plain paragraph (outside code, lists, tables and headings) as the summary. */
export function describe(markdown, fallbackTitle) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let title = fallbackTitle;
  let fence = false;
  let seenTitle = false;
  let paragraph = [];
  let summary = "";
  for (const line of lines) {
    if (/^```/.test(line)) { fence = !fence; continue; }
    if (fence) continue;
    const h1 = /^#\s+(.+)$/.exec(line);
    if (h1 && !seenTitle) { title = plain(h1[1]); seenTitle = true; continue; }
    if (!seenTitle || summary) continue;
    if (line.trim() === "") {
      if (paragraph.length) summary = plain(paragraph.join(" "));
      paragraph = [];
    } else if (/^(#|[-*+]\s|\d+\.\s|\||>|<|!\[)/.test(line)) {
      paragraph = [];
    } else paragraph.push(line.trim());
  }
  if (!summary && paragraph.length) summary = plain(paragraph.join(" "));
  return { title, summary: clip(summary, SUMMARY_MAX) };
}

/** The markdown after its first h1, which the viewer draws itself from the title. */
export function withoutTitle(markdown) {
  const lines = markdown.split("\n");
  const index = lines.findIndex((line) => /^#\s+/.test(line));
  return index === -1 ? markdown : lines.slice(index + 1).join("\n").replace(/^\n+/, "");
}

export function headingText(raw) {
  return raw.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[`*_]/g, "").trim();
}

export function slugifyHeading(text) {
  return text.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
}

/** h2 to h4 headings with their ids (repeats get -2, -3), skipping code fences; the same rules as lib/docs/headings.ts. */
export function headings(markdown) {
  const seen = new Map();
  const found = [];
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
    found.push({ id: count === 1 ? base : `${base}-${count}`, title, level: match[1].length, line: index });
  });
  return found;
}

/** The first plain words under each h2 and h3, so search can match a section's text as well as its heading. */
export function sectionExcerpts(markdown) {
  const lines = markdown.split("\n");
  return headings(markdown).filter((heading) => heading.level <= 3).map((heading) => {
    const words = [];
    let fence = false;
    for (let index = heading.line + 1; index < lines.length; index++) {
      const line = lines[index];
      if (/^```/.test(line)) { fence = !fence; continue; }
      if (fence) continue;
      if (/^#{1,4}\s/.test(line)) break;
      if (/^\|?\s*-{3}/.test(line) || /^!\[/.test(line)) continue;
      const text = plain(line.replace(/^\s*([-*+]|\d+\.|>|\|)\s*/, "").replace(/\|/g, " "));
      if (text) words.push(text);
      if (words.join(" ").length > EXCERPT_MAX) break;
    }
    return { id: heading.id, title: heading.title, level: heading.level, text: clip(words.join(" "), EXCERPT_MAX) };
  });
}
