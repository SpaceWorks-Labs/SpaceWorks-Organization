import { isSafeLink } from "./sections";

/**
 * A small Markdown subset for organisation pages, parsed into a tree that React renders as text nodes.
 * Raw HTML is never interpreted (it shows as typed), and links survive only with a safe address, so the
 * output is sanitised by construction. Supported: headings, paragraphs, line breaks, bullet and numbered
 * lists, quotes, **bold**, *italic*, `code` and [links](https://…).
 */

export type MarkdownInline =
  | { type: "text"; value: string }
  | { type: "strong"; children: MarkdownInline[] }
  | { type: "em"; children: MarkdownInline[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: MarkdownInline[] }
  | { type: "break" };

type MarkdownBlock =
  | { type: "heading"; level: 3 | 4; children: MarkdownInline[] }
  | { type: "paragraph"; children: MarkdownInline[] }
  | { type: "list"; ordered: boolean; items: MarkdownInline[][] }
  | { type: "quote"; children: MarkdownInline[] };

const MARKDOWN_MAX_LENGTH = 6000;

const TOKEN = /`([^`\n]+)`|\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)|\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*|(?<![A-Za-z0-9])_([^_\n]+?)_(?![A-Za-z0-9])|\n/g;

export function parseInline(source: string, depth = 0): MarkdownInline[] {
  const out: MarkdownInline[] = [];
  const push = (value: string) => {
    if (!value) return;
    const last = out.at(-1);
    if (last?.type === "text") last.value += value;
    else out.push({ type: "text", value });
  };
  let index = 0;
  for (const match of source.matchAll(TOKEN)) {
    push(source.slice(index, match.index));
    index = match.index + match[0].length;
    const [whole, code, label, href, strong, starEm, underscoreEm] = match;
    const nested = (value: string) => (depth >= 3 ? [{ type: "text" as const, value }] : parseInline(value, depth + 1));
    if (whole === "\n") out.push({ type: "break" });
    else if (code !== undefined) out.push({ type: "code", value: code });
    else if (label !== undefined) {
      if (href && isSafeLink(href)) out.push({ type: "link", href, children: nested(label) });
      else push(label);
    } else if (strong !== undefined) out.push({ type: "strong", children: nested(strong) });
    else out.push({ type: "em", children: nested(starEm ?? underscoreEm ?? "") });
  }
  push(source.slice(index));
  return out;
}

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^[-*+]\s+(.*)$/;
const NUMBERED = /^\d{1,3}[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;

export function parseMarkdown(input: string): MarkdownBlock[] {
  const lines = input.slice(0, MARKDOWN_MAX_LENGTH).replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];

  const flush = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", children: parseInline(paragraph.join("\n")) });
    if (list) blocks.push({ type: "list", ordered: list.ordered, items: list.items.map((item) => parseInline(item)) });
    if (quote.length) blocks.push({ type: "quote", children: parseInline(quote.join("\n")) });
    paragraph = [];
    list = null;
    quote = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    const heading = HEADING.exec(trimmed);
    if (heading) {
      flush();
      blocks.push({ type: "heading", level: heading[1].length === 3 ? 4 : 3, children: parseInline(heading[2]) });
      continue;
    }
    const bullet = BULLET.exec(trimmed);
    const numbered = bullet ? null : NUMBERED.exec(trimmed);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    const quoted = QUOTE.exec(trimmed);
    if (quoted) {
      if (!quote.length) flush();
      quote.push(quoted[1]);
      continue;
    }
    if (list) {
      // A line under a list item continues that item.
      list.items[list.items.length - 1] += ` ${trimmed}`;
      continue;
    }
    if (quote.length) flush();
    paragraph.push(trimmed);
  }
  flush();
  return blocks;
}

/** The text of a document without markup, for descriptions and search snippets. */
export function markdownToPlainText(input: string): string {
  const flat = (nodes: MarkdownInline[]): string => nodes.map((node) => (node.type === "text" || node.type === "code" ? node.value : node.type === "break" ? " " : flat(node.children))).join("");
  return parseMarkdown(input)
    .map((block) => (block.type === "list" ? block.items.map(flat).join(" ") : flat(block.children)))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
