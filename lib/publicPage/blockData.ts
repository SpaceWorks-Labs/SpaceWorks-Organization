import { contactFor, unitChainNearestFirst, type Contact } from "@/lib/units/contact";
import type { CountRow } from "./live";
import type { LiveStatKind, PageDocument, SectionOf } from "./sections";

/**
 * What the newer blocks read live beside the document (pure types and helpers, client-safe): the numbers block's
 * figures, the areas directory's entries and the area a page is shown for. Aggregates and contact details only,
 * never a member (lib/publicPage/liveStats.ts, lib/publicPage/areaData.ts load them).
 */

/** One metric of a numbers block, computed for the page's scope. Small counts are already removed (null / missing rows). */
export type LiveStatResult = {
  kind: LiveStatKind;
  /** "byGrouping" only: which grouping the rows are for. */
  groupingId?: string;
  /** "growth" only: the period in days. */
  days?: number;
  label: string;
  /** The count, or null when it is under the threshold (or the metric is a breakdown). */
  value: number | null;
  /** Growth only: joined in the period as a percentage of members before it; null when either is too small. */
  percent: number | null;
  /** Breakdowns (by area, plan, grouping): rows already suppressed, biggest first. */
  rows: CountRow[];
};

/** Results by section id, for every visible numbers block. */
export type LiveStatsData = Record<string, LiveStatResult[]>;

export type AreaEntry = {
  id: string;
  code: string;
  name: string;
  level: number;
  /** The organisation's name for this level ("Area", "Unit"), or "". */
  levelLabel: string;
  parentId: string | null;
  path: string;
  contact: Contact;
  /** Slugs of the open plans offered to this area, in the organisation's plan order. */
  joinPlans: string[];
  /** The area's own page. */
  pageHref: string;
};

/** The area an area page is shown for. */
export type AreaContext = {
  id: string;
  code: string;
  name: string;
  level: number;
  levelLabel: string;
  path: string;
  /** What the area's people reach: each detail from the nearest area that sets it, else the organisation. */
  contact: Contact;
  /** Only what an area (or one above it) sets, with no organisation fallback; null where none does. */
  ownContact: Contact;
  /** From the top level down to this area (this area last). */
  trail: Array<{ name: string; code: string; pageHref: string }>;
};

/** The join link for an area: `?unit=CODE` is what the join form reads. Null when the area offers no open plan. */
export function areaJoinHref(area: Pick<AreaEntry, "code" | "joinPlans">, section: Pick<SectionOf<"areas">, "joinPlanSlug">, orgSlug: string): string | null {
  const slug = area.joinPlans.includes(section.joinPlanSlug) ? section.joinPlanSlug : area.joinPlans[0];
  return slug ? `/o/${orgSlug}/join/${slug}?unit=${area.code}` : null;
}

/** The join link on a plan card or button when the page is for an area. */
export const joinHrefFor = (orgSlug: string, planSlug: string, areaCode: string | null) =>
  `/o/${orgSlug}/join/${planSlug}${areaCode ? `?unit=${areaCode}` : ""}`;

/**
 * The areas an areas block lists. Without an area page: from the top level (or below `parentCode`). On an area
 * page with no `parentCode`: that area's own sub-areas. "level" is one level down; "subtree" is everything below.
 */
export function areasForSection(section: Pick<SectionOf<"areas">, "parentCode" | "scope">, areas: readonly AreaEntry[], current: Pick<AreaContext, "id"> | null): AreaEntry[] {
  const parent = section.parentCode ? areas.find((area) => area.code === section.parentCode) : current ? areas.find((area) => area.id === current.id) : undefined;
  if (section.parentCode && !parent) return [];
  const below = parent ? areas.filter((area) => area.path.startsWith(`${parent.path}/`)) : [...areas];
  const listed = section.scope === "subtree" ? below : below.filter((area) => area.level === (parent ? parent.level + 1 : 0));
  return listed;
}

type UnitRow = { id: string; code: string; name: string; level: number; parentId: string | null; path: string; sortOrder: number; contactEmail: string | null; contactPhone: string | null; website: string | null };
type OrgContact = { contactEmail: string | null; contactPhone: string | null; website: string | null };

/** An area's own contact with each blank detail taken from the nearest area above, then the organisation. */
export function areaContact(unit: Pick<UnitRow, "path">, units: readonly UnitRow[], org: OrgContact): Contact {
  return contactFor(unitChainNearestFirst(unit, units), org);
}

/**
 * The published document as an area page shows it: contact blocks take the area's own email and phone where an area
 * (or one above it) sets them, and keep what the organisation typed otherwise. Everything else is unchanged.
 */
export function applyAreaContext(document: PageDocument, area: Pick<AreaContext, "ownContact"> | null): PageDocument {
  if (!area) return document;
  const { email, phone } = area.ownContact;
  return {
    ...document,
    sections: document.sections.map((section) => (section.type === "contact" ? { ...section, email: email ?? section.email, phone: phone ?? section.phone } : section)),
  };
}

/**
 * A numbers block's figures picked from a catalogue of every metric (the editor loads one so a block changes live
 * as it is edited). Each metric takes its own label when it has one; metrics without figures are left out.
 */
export function statsForSection(section: Pick<SectionOf<"liveStats">, "metrics">, catalogue: readonly LiveStatResult[]): LiveStatResult[] {
  return section.metrics.flatMap((metric) => {
    const found = catalogue.find((result) => result.kind === metric.kind && (metric.kind !== "byGrouping" || result.groupingId === metric.groupingId) && (metric.kind !== "growth" || result.days === metric.days));
    return found ? [{ ...found, label: metric.label || found.label }] : [];
  });
}
