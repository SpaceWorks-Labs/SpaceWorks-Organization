import { isExternalLink } from "./links";
import type { PageAction, PageDocument } from "./sections";

/**
 * What a public page reads live beside its document (pure types and helpers, client-safe): the aggregate member
 * counts, the sample member card, and where a section's buttons go.
 */

/** Below this, a count is never shown: a handful of members could be identified (docs/features/public-page.md). */
export const MIN_PUBLIC_COUNT = 5;

export type CountRow = { label: string; count: number };

/**
 * Aggregates only, never names: current members (an ACTIVE or GRACE term) in total, by plan and by top-level unit.
 * Small counts are already removed (null total, missing rows) by `suppressSmallCounts`.
 */
export type PublicCounts = { total: number | null; byPlan: CountRow[]; byUnit: CountRow[] };

/**
 * Remove every count below the threshold. When exactly one row of a breakdown is hidden, the smallest shown row is
 * hidden too, so the total minus the shown rows never gives the hidden one away.
 */
export function suppressSmallCounts(rows: CountRow[], threshold = MIN_PUBLIC_COUNT): CountRow[] {
  const shown = rows.filter((row) => row.count >= threshold);
  if (rows.length - shown.length !== 1 || shown.length === 0) return sortRows(shown);
  const smallest = shown.reduce((min, row) => (row.count < min.count ? row : min), shown[0]!);
  return sortRows(shown.filter((row) => row !== smallest));
}

const sortRows = (rows: CountRow[]) => [...rows].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

/** The total, or null below the threshold. */
export const publicTotal = (count: number, threshold = MIN_PUBLIC_COUNT) => (count >= threshold ? count : null);

/** Which counts a document's visible counts sections ask for; nothing is loaded that no section shows. */
export function countsWanted(document: Pick<PageDocument, "sections">) {
  const wanted = { total: false, byPlan: false, byUnit: false };
  for (const section of document.sections) {
    if (section.type !== "counts" || !section.visible) continue;
    wanted.total ||= section.total;
    wanted.byPlan ||= section.byPlan;
    wanted.byUnit ||= section.byUnit;
  }
  return wanted;
}

/** The sample member card: an image URL (drawn with sample holder data, never a real member) and its paper shape. */
export type SampleCard = { src: string; widthMm: number; heightMm: number };

type ActionContext = {
  orgSlug: string;
  /** Plans that can be joined from the page right now. */
  plans: Array<{ slug: string; joinMode: string }>;
  takingMembers: boolean;
  /** The id of the first visible plans section, when there is one. */
  plansSectionId: string | null;
  /** On an area page: the area's code, so every join link carries `?unit=CODE` (the join form reads it). */
  areaCode?: string | null;
};

/** Where a button goes, or null when it has nowhere to go (it is then not drawn). */
export function actionHref(action: PageAction, context: ActionContext): { href: string; external: boolean } | null {
  if (action.kind === "none" || !action.label) return null;
  const plansAnchor = context.plansSectionId ? { href: `#section-${context.plansSectionId}`, external: false } : null;
  if (action.kind === "link") return action.url ? { href: action.url, external: isExternalLink(action.url) } : null;
  if (action.kind === "plans") return plansAnchor;
  const plan = context.plans.find((one) => one.slug === action.planSlug);
  const joinable = context.takingMembers && plan && plan.joinMode !== "CLOSED" && plan.joinMode !== "INVITE_ONLY";
  if (joinable) return { href: `/o/${context.orgSlug}/join/${plan.slug}${context.areaCode ? `?unit=${context.areaCode}` : ""}`, external: false };
  return plansAnchor;
}

/** The id of the first visible plans section, the target of "plans" buttons. */
export function plansSectionId(document: Pick<PageDocument, "sections">): string | null {
  return document.sections.find((section) => section.type === "plans" && section.visible)?.id ?? null;
}
