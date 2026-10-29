import { z } from "zod";

/**
 * The public organisation page document: a tagline, an optional cover, an accent and an ordered list of
 * sections. Pure and client-safe, so the editor, its live preview and the server share one schema.
 */

export const SECTION_TYPES = ["about", "plans", "units", "contact", "faq", "gallery", "links", "text"] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const SECTION_LABELS: Record<SectionType, { label: string; description: string }> = {
  about: { label: "About", description: "Your story, written in Markdown." },
  plans: { label: "Membership plans", description: "Your open plans with their join buttons, always up to date." },
  units: { label: "Units directory", description: "Your regions, branches or chapters." },
  contact: { label: "Contact", description: "How people reach you." },
  faq: { label: "Questions and answers", description: "Answers to what people ask most." },
  gallery: { label: "Image gallery", description: "Up to 12 photos." },
  links: { label: "Links and socials", description: "Your website and social profiles." },
  text: { label: "Free text", description: "A plain block of text." },
};

export const MAX_SECTIONS = 20;
export const MAX_GALLERY_IMAGES = 12;

/** Upload keys the page may reference: the organisation's own page images only. */
const PAGE_IMAGE_KEY = /^organisations\/[A-Za-z0-9_-]{1,128}\/page-images\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i;

export function isPageImageKeyFor(key: string, organisationId: string) {
  return PAGE_IMAGE_KEY.test(key) && key.startsWith(`organisations/${organisationId}/page-images/`);
}

/** Where the browser loads an uploaded page image from. */
export function pageImageUrl(key: string) {
  return `/api/uploads/${key}`;
}

/** Links open only on the web or in a mail or phone app; nothing that runs script. */
export function isSafeLink(value: string) {
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value)) return true;
  if (/^tel:\+?[0-9 ()-]{3,32}$/i.test(value)) return true;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

const text = (max: number) => z.string().trim().max(max);
const title = text(80).default("");
const sectionId = z.string().regex(/^[a-z0-9]{6,16}$/);
const link = z.string().trim().max(500).refine(isSafeLink, "Use a web address starting with https://, or mailto:");
const optional = (max: number) => text(max).optional().default("");

const base = { id: sectionId, visible: z.boolean().default(true), title };

export const LINK_KINDS = ["website", "instagram", "facebook", "x", "linkedin", "youtube", "github", "whatsapp", "other"] as const;

export const sectionSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("about"), markdown: text(6000).default("") }),
  z.object({ ...base, type: z.literal("plans"), intro: optional(600) }),
  z.object({ ...base, type: z.literal("units"), intro: optional(600) }),
  z.object({
    ...base,
    type: z.literal("contact"),
    email: z.string().trim().toLowerCase().max(320).refine((value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "Enter a valid email address").default(""),
    phone: z.string().trim().max(32).refine((value) => value === "" || /^[+0-9 ()-]{6,32}$/.test(value), "Enter a valid phone number").default(""),
    address: optional(400),
    hours: optional(200),
  }),
  z.object({ ...base, type: z.literal("faq"), items: z.array(z.object({ question: text(200).min(1, "Write the question"), answer: text(2000).min(1, "Write the answer") })).max(30).default([]) }),
  z.object({ ...base, type: z.literal("gallery"), images: z.array(z.object({ key: z.string().regex(PAGE_IMAGE_KEY, "Upload the image again"), alt: text(160).default("") })).max(MAX_GALLERY_IMAGES).default([]) }),
  z.object({ ...base, type: z.literal("links"), links: z.array(z.object({ kind: z.enum(LINK_KINDS).default("other"), label: text(60).min(1, "Name the link"), url: link })).max(16).default([]) }),
  z.object({ ...base, type: z.literal("text"), body: text(4000).default("") }),
]);

export type PageSection = z.infer<typeof sectionSchema>;
export type SectionOf<T extends SectionType> = Extract<PageSection, { type: T }>;

export const pageDocumentSchema = z
  .object({
    tagline: text(160).default(""),
    coverAssetKey: z.string().regex(PAGE_IMAGE_KEY, "Upload the cover again").nullable().default(null),
    accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Choose a colour like #006E63").transform((value) => value.toUpperCase()).nullable().default(null),
    sections: z.array(sectionSchema).max(MAX_SECTIONS, `At most ${MAX_SECTIONS} sections`).default([]),
  })
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    value.sections.forEach((section, index) => {
      if (ids.has(section.id)) ctx.addIssue({ code: "custom", path: ["sections", index, "id"], message: "Duplicate section" });
      ids.add(section.id);
    });
  });

export type PageDocument = z.infer<typeof pageDocumentSchema>;

/** Every image key a document references, for ownership checks. */
export function documentImageKeys(document: PageDocument): string[] {
  const keys = document.coverAssetKey ? [document.coverAssetKey] : [];
  for (const section of document.sections) if (section.type === "gallery") keys.push(...section.images.map((image) => image.key));
  return keys;
}

/** A stored document, read leniently: anything invalid is dropped rather than breaking the page. */
export function readPageDocument(value: unknown): PageDocument {
  const parsed = pageDocumentSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const sections = Array.isArray(record.sections) ? record.sections.flatMap((section) => {
    const one = sectionSchema.safeParse(section);
    return one.success ? [one.data] : [];
  }) : [];
  const rest = pageDocumentSchema.safeParse({ ...record, sections: [] });
  return { ...(rest.success ? rest.data : { tagline: "", coverAssetKey: null, accentColor: null }), sections: sections.slice(0, MAX_SECTIONS) };
}

function newSectionId(random: () => number = Math.random) {
  return Array.from({ length: 10 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36)]).join("");
}

/** A new section of a type, with sensible starting content. */
export function newSection(type: SectionType, id = newSectionId(), org?: { contactEmail?: string | null; contactPhone?: string | null }): PageSection {
  const common = { id, visible: true, title: SECTION_LABELS[type].label };
  switch (type) {
    case "about": return { ...common, type, title: "About us", markdown: "" };
    case "plans": return { ...common, type, title: "Membership", intro: "" };
    case "units": return { ...common, type, title: "Where we are", intro: "" };
    case "contact": return { ...common, type, title: "Get in touch", email: org?.contactEmail ?? "", phone: org?.contactPhone ?? "", address: "", hours: "" };
    case "faq": return { ...common, type, items: [] };
    case "gallery": return { ...common, type, title: "Gallery", images: [] };
    case "links": return { ...common, type, title: "Find us online", links: [] };
    case "text": return { ...common, type, title: "", body: "" };
  }
}

/** A first draft for an organisation that has never edited its page: about, plans and contact. */
export function starterDocument(org: { description: string; contactEmail?: string | null; contactPhone?: string | null }, makeId = newSectionId): PageDocument {
  const about = newSection("about", makeId());
  const sections: PageSection[] = [
    about.type === "about" ? { ...about, markdown: org.description } : about,
    newSection("plans", makeId()),
    newSection("contact", makeId(), org),
  ];
  return { tagline: "", coverAssetKey: null, accentColor: null, sections };
}
