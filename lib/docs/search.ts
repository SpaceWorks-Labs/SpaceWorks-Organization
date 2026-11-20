import type { SearchDoc } from "./search-index";

export type SearchHit = { key: string; kind: "page" | "heading"; title: string; context: string; href: string };
export type TextPart = { text: string; match: boolean };

const normalise = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

export function queryWords(query: string): string[] {
  return normalise(query).split(/\s+/).filter(Boolean);
}

/**
 * Every query word must appear. Titles outrank headings, headings outrank a section's first words and summaries,
 * and a match at the start of a title outranks one in the middle. Pure, so it is unit-tested and runs in the browser.
 */
export function searchDocs(index: readonly SearchDoc[], query: string, limit = 12): SearchHit[] {
  const words = queryWords(query);
  if (!words.length) return [];
  const score = (text: string, weight: number) => {
    const value = normalise(text);
    if (!words.every((word) => value.includes(word))) return 0;
    return weight + (value.startsWith(words[0]) ? 3 : 0) + (value === words.join(" ") ? 5 : 0);
  };
  const scored: { hit: SearchHit; score: number }[] = [];
  for (const doc of index) {
    const page = Math.max(score(doc.title, 30), score(`${doc.title} ${doc.summary}`, 12), score(`${doc.title} ${doc.section}`, 8));
    if (page) scored.push({ score: page, hit: { key: doc.slug, kind: "page", title: doc.title, context: doc.summary || doc.section, href: `/docs/${doc.slug}` } });
    for (const [id, heading, text] of doc.headings) {
      const value = score(heading, 18) || score(`${doc.title} ${heading}`, 10) || score(`${heading} ${text}`, 6);
      if (value) scored.push({ score: value, hit: { key: `${doc.slug}#${id}`, kind: "heading", title: heading, context: `${doc.title} · ${text || doc.section}`, href: `/docs/${doc.slug}#${id}` } });
    }
  }
  return scored
    .sort((a, b) => b.score - a.score || a.hit.title.localeCompare(b.hit.title))
    .slice(0, limit)
    .map((item) => item.hit);
}

/** Splits text into plain and matching parts, so the palette can mark what matched without parsing HTML. */
export function highlight(text: string, words: readonly string[]): TextPart[] {
  if (!words.length || !text) return [{ text, match: false }];
  // toLowerCase keeps positions (normalising could shift them); a word with an accent simply goes unmarked.
  const lower = text.toLowerCase();
  if (lower.length !== text.length) return [{ text, match: false }];
  const marks = new Array<boolean>(text.length).fill(false);
  for (const word of words) {
    for (let at = lower.indexOf(word); at !== -1; at = lower.indexOf(word, at + word.length)) marks.fill(true, at, at + word.length);
  }
  const parts: TextPart[] = [];
  for (let index = 0; index < text.length; index++) {
    const last = parts[parts.length - 1];
    if (last && last.match === marks[index]) last.text += text[index];
    else parts.push({ text: text[index], match: marks[index] });
  }
  return parts;
}
