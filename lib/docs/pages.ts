import { DOCS, DOC_SCREENS, type DocEntry, type DocSection } from "./content";

export type { DocEntry, DocSection };

export const SECTION_TITLES: Record<DocSection, string> = {
  features: "Features",
  operators: "Running Space Works Organization",
};

export const DOC_SLUGS: readonly string[] = DOCS.map((doc) => doc.slug);

/** One doc by slug, or null when the slug is not on the allow-list. */
export function getDoc(slug: string): DocEntry | null {
  return DOCS.find((doc) => doc.slug === slug) ?? null;
}

export function docsBySection(section: DocSection): DocEntry[] {
  return DOCS.filter((doc) => doc.section === section);
}

/** Whether a screenshot was captured and shipped; missing ones render as a note instead of a broken image. */
export function screenExists(src: string): boolean {
  return DOC_SCREENS.includes(src);
}
