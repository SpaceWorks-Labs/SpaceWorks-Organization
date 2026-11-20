import { z } from "zod";
import { PAGE_IMAGE_KEY } from "./links";
import { SECTION_SCHEMAS } from "./sectionSchemas";

/**
 * The public organisation page document: a tagline, an optional cover, an accent and an ordered list of
 * sections. Pure and client-safe, so the editor, its live preview and the server share one schema. The section
 * schemas and their limits live in sectionSchemas.ts; starting content in defaults.ts; templates in templates.ts.
 */

export { isExternalLink, isPageFileKey, isPageImageKeyFor, isPageUploadKeyFor, isSafeLink, pageFileUrl, pageImageUrl } from "./links";
export { ACTION_KINDS, CTA_TONES, EMPTY_ACTION, HERO_LAYOUTS, IMAGE_SIDES, LINK_KINDS, MAX_DOWNLOADS, MAX_GALLERY_IMAGES, MAX_PEOPLE, MAX_STATS, MAX_TESTIMONIALS, MAX_TIMELINE, type ActionKind, type PageAction } from "./sectionSchemas";
export { newSection, newSectionId, starterDocument } from "./defaults";

export const SECTION_TYPES = [
  "hero", "cta", "about", "plans", "counts", "card", "stats", "committee", "testimonials", "timeline",
  "imageText", "video", "gallery", "downloads", "units", "faq", "links", "contact", "map", "text",
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export type SectionGroup = "Welcome" | "Membership" | "People and story" | "Media" | "Information";
export const SECTION_GROUPS: SectionGroup[] = ["Welcome", "Membership", "People and story", "Media", "Information"];

export const SECTION_LABELS: Record<SectionType, { label: string; description: string; group: SectionGroup }> = {
  hero: { label: "Hero", description: "A big headline, a line about you, buttons and a photo. It replaces the plain top of the page.", group: "Welcome" },
  cta: { label: "Call to action", description: "A short invitation with one or two buttons.", group: "Welcome" },
  about: { label: "About", description: "Your story, written in Markdown.", group: "Welcome" },
  plans: { label: "Membership plans", description: "Your open plans with their join buttons, always up to date.", group: "Membership" },
  counts: { label: "Live counts", description: "How many members you have, by plan or unit. Small numbers stay hidden.", group: "Membership" },
  card: { label: "Member card", description: "Your approved card design, shown with a sample name.", group: "Membership" },
  stats: { label: "Numbers", description: "Up to 8 figures you type in, like years running or events a year.", group: "Membership" },
  committee: { label: "Committee", description: "Office bearers with photo, name and title.", group: "People and story" },
  testimonials: { label: "Testimonials", description: "What members say about you.", group: "People and story" },
  timeline: { label: "Story timeline", description: "Milestones by year or date.", group: "People and story" },
  imageText: { label: "Image with text", description: "A photo beside a block of text.", group: "Media" },
  video: { label: "Video", description: "A YouTube or Vimeo video, loaded only when someone plays it.", group: "Media" },
  gallery: { label: "Image gallery", description: "Up to 12 photos.", group: "Media" },
  downloads: { label: "Downloads", description: "Images people can download, like a poster or a brochure page.", group: "Media" },
  units: { label: "Units directory", description: "Your regions, branches or chapters.", group: "Information" },
  faq: { label: "Questions and answers", description: "Answers to what people ask most.", group: "Information" },
  links: { label: "Links and socials", description: "Your website and social profiles.", group: "Information" },
  contact: { label: "Contact", description: "How people reach you.", group: "Information" },
  map: { label: "Map link", description: "Your address and a link that opens it in a maps app.", group: "Information" },
  text: { label: "Free text", description: "A plain block of text.", group: "Information" },
};

export const MAX_SECTIONS = 30;

const S = SECTION_SCHEMAS;
export const sectionSchema = z.discriminatedUnion("type", [
  S.hero, S.cta, S.counts, S.card, S.about, S.plans, S.units, S.committee, S.testimonials, S.timeline, S.stats,
  S.imageText, S.video, S.gallery, S.downloads, S.faq, S.links, S.contact, S.map, S.text,
]);

export type PageSection = z.infer<typeof sectionSchema>;
export type SectionOf<T extends SectionType> = Extract<PageSection, { type: T }>;

export const pageDocumentSchema = z
  .object({
    tagline: z.string().trim().max(160).default(""),
    coverAssetKey: z.string().regex(PAGE_IMAGE_KEY, "Upload the cover again").nullable().default(null),
    accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Choose a colour like #006E63").transform((value) => value.toUpperCase()).nullable().default(null),
    sections: z.array(sectionSchema).max(MAX_SECTIONS, `At most ${MAX_SECTIONS} sections`).default([]),
  })
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    let heroes = 0;
    value.sections.forEach((section, index) => {
      if (ids.has(section.id)) ctx.addIssue({ code: "custom", path: ["sections", index, "id"], message: "Duplicate section" });
      ids.add(section.id);
      if (section.type === "hero" && ++heroes > 1) ctx.addIssue({ code: "custom", path: ["sections", index, "type"], message: "A page has one hero" });
      if (section.type === "counts" && !section.total && !section.byPlan && !section.byUnit) ctx.addIssue({ code: "custom", path: ["sections", index, "total"], message: "Choose at least one count" });
    });
  });

export type PageDocument = z.infer<typeof pageDocumentSchema>;

/** Every image key a document references, for ownership checks. */
export function documentImageKeys(document: PageDocument): string[] {
  const keys = document.coverAssetKey ? [document.coverAssetKey] : [];
  for (const section of document.sections) {
    switch (section.type) {
      case "gallery": keys.push(...section.images.map((image) => image.key)); break;
      case "downloads": keys.push(...section.files.map((file) => file.key)); break;
      case "committee": for (const person of section.people) if (person.photoKey) keys.push(person.photoKey); break;
      case "hero": case "imageText": if (section.imageKey) keys.push(section.imageKey); break;
    }
  }
  return keys;
}

/** The first visible section, when it is the hero: it then replaces the plain top of the page. */
export function leadingHero(document: Pick<PageDocument, "sections">): SectionOf<"hero"> | null {
  const first = document.sections.find((section) => section.visible);
  return first?.type === "hero" ? first : null;
}

/** A stored document, read leniently: anything invalid is dropped rather than breaking the page. */
export function readPageDocument(value: unknown): PageDocument {
  const parsed = pageDocumentSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  let hero = false;
  const sections = Array.isArray(record.sections) ? record.sections.flatMap((section) => {
    const one = sectionSchema.safeParse(section);
    if (!one.success || (one.data.type === "hero" && hero)) return [];
    if (one.data.type === "hero") hero = true;
    if (one.data.type === "counts" && !one.data.total && !one.data.byPlan && !one.data.byUnit) return [];
    return [one.data];
  }) : [];
  const ids = new Set<string>();
  const unique = sections.filter((section) => !ids.has(section.id) && Boolean(ids.add(section.id)));
  const rest = pageDocumentSchema.safeParse({ ...record, sections: [] });
  return { ...(rest.success ? rest.data : { tagline: "", coverAssetKey: null, accentColor: null }), sections: unique.slice(0, MAX_SECTIONS) };
}
