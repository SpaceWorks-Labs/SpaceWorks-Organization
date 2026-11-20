import { GITHUB_URL } from "@/lib/openSource";
import { DOC_SECTIONS, DOCS, DOC_SCREENS, type DocEntry, type DocSection } from "./content";

export type { DocEntry, DocSection };
export { DOC_SECTIONS };

/** Docs are edited on the dev branch, where pull requests land. */
export const DOCS_BRANCH = "dev";

export const SECTION_TITLES = Object.fromEntries(DOC_SECTIONS.map((section) => [section.key, section.title])) as Record<DocSection, string>;

export const DOC_SLUGS: readonly string[] = DOCS.map((doc) => doc.slug);

/** One doc by slug, or null when the slug is not on the allow-list. */
export function getDoc(slug: string): DocEntry | null {
  return DOCS.find((doc) => doc.slug === slug) ?? null;
}

export function docsBySection(section: DocSection): DocEntry[] {
  return DOCS.filter((doc) => doc.section === section);
}

/** The pages before and after this one in its section's reading order. */
export function neighbours(slug: string): { previous: DocEntry | null; next: DocEntry | null } {
  const doc = getDoc(slug);
  if (!doc) return { previous: null, next: null };
  const pages = docsBySection(doc.section);
  const index = pages.findIndex((page) => page.slug === slug);
  return { previous: pages[index - 1] ?? null, next: pages[index + 1] ?? null };
}

/** Anchor of a section on the docs home: /docs#features. */
export function sectionHref(section: DocSection) {
  return `/docs#${section}`;
}

/** "Edit this page on GitHub", or null for pages generated from the code. */
export function editUrl(doc: DocEntry): string | null {
  return doc.generated ? null : `${GITHUB_URL}/edit/${DOCS_BRANCH}/${doc.source}`;
}

/** Whether a screenshot was captured and shipped; missing ones render as a note instead of a broken image. */
export function screenExists(src: string): boolean {
  return DOC_SCREENS.includes(src);
}
