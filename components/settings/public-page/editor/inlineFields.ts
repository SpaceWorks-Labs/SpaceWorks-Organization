import type { PageSection } from "@/lib/publicPage/sections";

/*
 * What can be edited in place on the canvas: a section's plain-text fields (headings, short paragraphs, button labels),
 * each with its path in the document, current value and limit. Markdown bodies and everything else are edited in the
 * settings panel. The canvas finds the field under a click by its rendered text (the real renderers are unchanged), so
 * only fields whose text appears as-is on the page are listed, in render order.
 */

export type InlineField = { path: string; value: string; multiline: boolean; max: number };

const one = (path: string, value: string, max: number, multiline = false): InlineField => ({ path, value, max, multiline });
const button = (path: string, action: { kind: string; label: string }) => (action.kind === "none" ? [] : [one(`${path}.label`, action.label, 40)]);

export function inlineFields(section: PageSection): InlineField[] {
  const title = section.type === "hero" ? [] : [one("title", section.title, 80)];
  const intro = "intro" in section && typeof section.intro === "string" ? [one("intro", section.intro, 600, true)] : [];
  switch (section.type) {
    case "hero": return [one("headline", section.headline, 120), one("subtitle", section.subtitle, 400, true), ...button("primary", section.primary), ...button("secondary", section.secondary)];
    case "cta": return [...title, one("headline", section.headline, 120), one("body", section.body, 400, true), ...button("primary", section.primary), ...button("secondary", section.secondary)];
    case "text": return [...title, one("body", section.body, 4000, true)];
    case "imageText": return [...title, ...button("primary", section.primary)];
    case "stats": return [...title, ...section.items.flatMap((item, i) => [one(`items.${i}.value`, item.value, 16), one(`items.${i}.label`, item.label, 60)])];
    case "committee": return [...title, ...intro, ...section.people.flatMap((person, i) => [one(`people.${i}.name`, person.name, 80), one(`people.${i}.role`, person.role, 80)])];
    case "testimonials": return [...title, ...section.items.flatMap((item, i) => [one(`items.${i}.quote`, item.quote, 500, true), one(`items.${i}.name`, item.name, 80), one(`items.${i}.role`, item.role, 80)])];
    case "timeline": return [...title, ...section.items.flatMap((item, i) => [one(`items.${i}.date`, item.date, 40), one(`items.${i}.title`, item.title, 120), one(`items.${i}.body`, item.body, 600, true)])];
    case "faq": return [...title, ...section.items.flatMap((item, i) => [one(`items.${i}.question`, item.question, 200), one(`items.${i}.answer`, item.answer, 2000, true)])];
    case "downloads": return [...title, ...intro, ...section.files.map((file, i) => one(`files.${i}.label`, file.label, 80))];
    case "links": return [...title, ...section.links.map((link, i) => one(`links.${i}.label`, link.label, 60))];
    case "video": return [...title, one("caption", section.caption, 200, true)];
    case "map": return [...title, one("address", section.address, 400, true), one("label", section.label, 40)];
    case "contact": return [...title, one("address", section.address, 400, true), one("hours", section.hours, 200, true)];
    case "columns":
      return [...title, ...section.columns.flatMap((column, c) => column.items.flatMap((item, i) => {
        const at = `columns.${c}.items.${i}`;
        switch (item.type) {
          case "heading": return [one(`${at}.text`, item.text, 120)];
          case "text": return [one(`${at}.body`, item.body, 1200, true)];
          case "button": return button(`${at}.action`, item.action);
          case "icon": return [one(`${at}.label`, item.label, 80)];
          case "image": return [];
        }
      }))];
    case "buttons": return [...title, ...section.items.flatMap((item, i) => button(`items.${i}`, item))];
    case "iconList": return [...title, ...section.items.flatMap((item, i) => [one(`items.${i}.title`, item.title, 80), one(`items.${i}.text`, item.text, 300, true)])];
    case "badges": return [...title, ...section.items.map((item, i) => one(`items.${i}.label`, item.label, 40))];
    case "membersPreview": return [...title, ...intro, ...section.points.map((point, i) => one(`points.${i}`, point, 160))];
    default: return [...title, ...intro];
  }
}

const normal = (value: string) => value.replace(/\s+/g, " ").trim();

/**
 * The editable field whose text is under a point inside `root`, with the element that holds it. Text nodes are matched
 * by their whole (whitespace-normalised) text; when several fields share a text, the n-th matching node on the page is
 * the n-th such field.
 */
export function pickInlineField(root: HTMLElement, x: number, y: number, fields: readonly InlineField[]): { field: InlineField; element: HTMLElement } | null {
  const wanted = new Map<string, InlineField[]>();
  for (const field of fields) {
    const key = normal(field.value);
    if (key) wanted.set(key, [...(wanted.get(key) ?? []), field]);
  }
  if (wanted.size === 0) return null;
  const seen = new Map<string, number>();
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = root.ownerDocument.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const key = normal(node.nodeValue ?? "");
    const matches = key ? wanted.get(key) : undefined;
    if (!matches || !node.parentElement) continue;
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    range.selectNodeContents(node);
    const hit = [...range.getClientRects()].some((rect) => x >= rect.left - 4 && x <= rect.right + 4 && y >= rect.top - 2 && y <= rect.bottom + 2);
    if (hit) return { field: matches[Math.min(occurrence, matches.length - 1)]!, element: node.parentElement };
  }
  return null;
}
