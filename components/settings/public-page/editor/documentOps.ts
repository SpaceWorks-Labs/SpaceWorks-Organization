import { MAX_SECTIONS, type PageDocument, type PageSection } from "@/lib/publicPage/sections";
import { moveTo } from "../sectionContent";

/*
 * The visual editor's document changes, as pure functions over the page document (the editor keeps each result in
 * its undo history). Every change returns a new document; one that changes nothing returns the same object.
 */

/** Put a new section after `afterId` (or at the end when it is null or missing). A page holds at most MAX_SECTIONS. */
export function insertSectionAfter(document: PageDocument, section: PageSection, afterId: string | null): PageDocument {
  if (document.sections.length >= MAX_SECTIONS) return document;
  const at = afterId ? document.sections.findIndex((one) => one.id === afterId) : -1;
  const index = at === -1 ? document.sections.length : at + 1;
  return { ...document, sections: [...document.sections.slice(0, index), section, ...document.sections.slice(index)] };
}

/** Move the section at `from` to `to` (both indexes into the current list). */
export function moveSectionTo(document: PageDocument, from: number, to: number): PageDocument {
  const sections = moveTo(document.sections, from, to);
  return sections === document.sections ? document : { ...document, sections };
}

export function removeSection(document: PageDocument, id: string): PageDocument {
  const sections = document.sections.filter((one) => one.id !== id);
  return sections.length === document.sections.length ? document : { ...document, sections };
}

export function replaceSection(document: PageDocument, next: PageSection): PageDocument {
  let changed = false;
  const sections = document.sections.map((one) => {
    if (one.id !== next.id || one === next) return one;
    changed = true;
    return next;
  });
  return changed ? { ...document, sections } : document;
}

const isIndex = (key: string) => /^\d+$/.test(key);

/** The value at a dotted path ("primary.label", "items.2.title"), or undefined. */
export function getIn(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => (current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined), value);
}

/** A copy of `value` with the dotted path set to `next`; arrays and objects along the way are copied, not changed. */
export function setIn<T>(value: T, path: string, next: unknown): T {
  const [key, ...rest] = path.split(".");
  if (key === undefined) return value;
  const current = (value ?? (isIndex(key) ? [] : {})) as Record<string, unknown> | unknown[];
  const child = rest.length ? setIn((current as Record<string, unknown>)[key], rest.join("."), next) : next;
  if (Array.isArray(current)) {
    const copy = [...current];
    copy[Number(key)] = child;
    return copy as T;
  }
  return { ...current, [key]: child } as T;
}

/** The server's errors for one section, keyed by the path inside it. */
export function errorsForSection(errors: Record<string, string[]>, index: number): Record<string, string[]> {
  const prefix = `sections.${index}.`;
  return Object.fromEntries(Object.entries(errors).filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key.slice(prefix.length), value]));
}

/** The indexes of sections the server marked, in page order. */
export function sectionsWithErrors(errors: Record<string, string[]>): number[] {
  const indexes = new Set<number>();
  for (const key of Object.keys(errors)) {
    const match = /^sections\.(\d+)\./.exec(key);
    if (match) indexes.add(Number(match[1]));
  }
  return [...indexes].sort((a, b) => a - b);
}
