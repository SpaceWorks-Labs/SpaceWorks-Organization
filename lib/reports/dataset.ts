/**
 * The rows every membership metric is computed from, and the indexes over them. Pure and client-safe:
 * lib/reports/source.ts loads these for one organisation (already narrowed to the viewer's unit subtree and
 * the report's plan filter); tests build them by hand. Definitions: docs/REPORTS.md.
 */
import type { TermKind, TermStatus } from "@/lib/membership/lifecycle";

export type ReportMember = {
  id: string;
  memberNumber: number;
  name: string;
  unitId: string | null;
  unitPath: string | null;
  source: "JOIN_FORM" | "MANUAL" | "IMPORT";
  stateCode: string | null;
  hasPhone: boolean;
  hasPhoto: boolean;
  isMinor: boolean;
  hasGuardian: boolean;
  /** Member role ids, primary first. */
  roleIds: string[];
  createdAt: Date;
};

export type ReportTerm = {
  id: string;
  memberId: string;
  planId: string;
  status: TermStatus;
  kind: TermKind;
  startsAt: Date | null;
  endsAt: Date | null;
  graceUntil: Date | null;
  renewedFromId: string | null;
  createdAt: Date;
};

export type ReportEvent = {
  termId: string;
  from: TermStatus | null;
  to: TermStatus;
  effectiveAt: Date;
  cause: string;
};

export type ReportRows = { members: ReportMember[]; terms: ReportTerm[]; events: ReportEvent[] };

/** Statuses a term only reaches after it was activated (paid, approved or free). */
const HELD_STATUSES: ReadonlySet<TermStatus> = new Set(["UPCOMING", "ACTIVE", "GRACE", "ENDED", "LAPSED", "REVOKED"]);
const BEFORE_ACTIVATION: ReadonlySet<TermStatus | null> = new Set([null, "PENDING_APPROVAL", "PENDING_PAYMENT", "EXPIRED"]);

export type PreparedTerm = ReportTerm & {
  /** Domain time the term was first activated (its activation event), or its start when no event exists. */
  activatedAt: Date | null;
  /** When a revoked term stopped counting. */
  revokedAt: Date | null;
  /** A held successor renews this term. */
  renewed: boolean;
  /** The term's own events, oldest first. */
  events: ReportEvent[];
};

export type Dataset = {
  members: ReportMember[];
  memberById: Map<string, ReportMember>;
  terms: PreparedTerm[];
  termsByMember: Map<string, PreparedTerm[]>;
  events: ReportEvent[];
};

function isHeld(term: Pick<ReportTerm, "status" | "startsAt">): boolean {
  return HELD_STATUSES.has(term.status) && term.startsAt !== null;
}

/** Index the rows. Terms and events of members outside `members` are dropped, so scope is applied once. */
export function prepareDataset(rows: ReportRows): Dataset {
  const memberById = new Map(rows.members.map((member) => [member.id, member]));
  const eventsByTerm = new Map<string, ReportEvent[]>();
  for (const event of rows.events) {
    const list = eventsByTerm.get(event.termId);
    if (list) list.push(event);
    else eventsByTerm.set(event.termId, [event]);
  }
  for (const list of eventsByTerm.values()) list.sort((a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime());

  const kept = rows.terms.filter((term) => memberById.has(term.memberId));
  const heldSuccessorOf = new Set(kept.filter((term) => term.renewedFromId && isHeld(term)).map((term) => term.renewedFromId!));
  const terms: PreparedTerm[] = kept.map((term) => {
    const events = eventsByTerm.get(term.id) ?? [];
    const activation = events.find((event) => (event.to === "ACTIVE" || event.to === "UPCOMING") && BEFORE_ACTIVATION.has(event.from));
    const revoke = term.status === "REVOKED" ? [...events].reverse().find((event) => event.to === "REVOKED") : undefined;
    return {
      ...term,
      events,
      activatedAt: isHeld(term) ? (activation?.effectiveAt ?? term.startsAt) : null,
      revokedAt: term.status === "REVOKED" ? (revoke?.effectiveAt ?? term.startsAt) : null,
      renewed: heldSuccessorOf.has(term.id),
    };
  });
  const termsByMember = new Map<string, PreparedTerm[]>();
  for (const term of terms) {
    const list = termsByMember.get(term.memberId);
    if (list) list.push(term);
    else termsByMember.set(term.memberId, [term]);
  }
  const termIds = new Set(terms.map((term) => term.id));
  return { members: rows.members, memberById, terms, termsByMember, events: rows.events.filter((event) => termIds.has(event.termId)) };
}

/** Members whose unit is `path` or below it. A null path keeps everyone. */
export function inSubtree(unitPath: string | null, path: string | null): boolean {
  if (!path) return true;
  if (!unitPath) return false;
  return unitPath === path || unitPath.startsWith(`${path}/`);
}

export function inRange(instant: Date | null, from: Date, to: Date): instant is Date {
  return instant !== null && instant >= from && instant < to;
}

/** The median of a list of numbers, or null when it is empty. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** A ratio, or null when there is nothing to divide by (shown as "—", never as 0%). */
export function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}
