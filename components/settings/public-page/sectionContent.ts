import { SECTION_LABELS, type PageSection } from "@/lib/publicPage/sections";

/** Whether removing a section would throw away something the editor typed or uploaded (it then asks first). */
export function sectionHasContent(section: PageSection): boolean {
  switch (section.type) {
    case "hero": return Boolean(section.headline || section.subtitle || section.imageKey);
    case "cta": return Boolean(section.body) || section.headline !== "Ready to join?";
    case "about": return Boolean(section.markdown);
    case "text": return Boolean(section.body);
    case "plans": case "units": case "card": case "counts": return Boolean(section.intro);
    case "committee": return section.people.length > 0 || Boolean(section.intro);
    case "testimonials": case "timeline": case "stats": case "faq": return section.items.length > 0;
    case "imageText": return Boolean(section.imageKey || section.markdown);
    case "video": return Boolean(section.url);
    case "gallery": return section.images.length > 0;
    case "downloads": return section.files.length > 0;
    case "links": return section.links.length > 0;
    case "contact": return Boolean(section.email || section.phone || section.address || section.hours);
    case "map": return Boolean(section.address || section.url);
    case "liveStats": return section.metrics.length > 2 || Boolean(section.intro);
    case "areas": return Boolean(section.intro || section.parentCode);
    case "columns": return section.columns.some((column) => column.items.length > 0);
    case "buttons": case "iconList": case "badges": return section.items.length > 0;
    case "divider": return false;
    case "membersPreview": return section.points.length > 4 || Boolean(section.intro);
  }
}

/** The name a row, a confirmation or an announcement uses for a section. */
export function sectionName(section: PageSection) {
  return section.title || (section.type === "hero" && section.headline) || (section.type === "cta" && section.headline) || SECTION_LABELS[section.type].label;
}

/** Move the item at `from` to position `to` (both indexes into the original list). */
export function moveTo<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length || to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}
