/**
 * Point-in-time standing: who is ACTIVE or in GRACE at an instant. Pure. Definitions: docs/REPORTS.md
 * "Active(t)" and "Grace(t)". GRACE is never counted as active.
 */
import type { Dataset, PreparedTerm } from "../dataset";

/** The term covers `t` as an active membership: started, not yet ended, not revoked by then. */
export function termActiveAt(term: PreparedTerm, t: Date): boolean {
  if (!term.activatedAt || !term.startsAt) return false;
  if (term.startsAt > t) return false;
  if (term.endsAt && t >= term.endsAt) return false;
  if (term.revokedAt && t >= term.revokedAt) return false;
  return true;
}

/** The term is past its end but inside its grace window at `t`. */
export function termGraceAt(term: PreparedTerm, t: Date): boolean {
  if (!term.activatedAt || !term.endsAt || !term.graceUntil) return false;
  if (t < term.endsAt || t >= term.graceUntil) return false;
  if (term.revokedAt && t >= term.revokedAt) return false;
  return true;
}

type Standing = "ACTIVE" | "GRACE" | null;

/** A member's standing across their terms: active on any term wins over grace on another. */
export function standingAt(terms: PreparedTerm[] | undefined, t: Date): Standing {
  if (!terms) return null;
  let grace = false;
  for (const term of terms) {
    if (termActiveAt(term, t)) return "ACTIVE";
    if (!grace && termGraceAt(term, t)) grace = true;
  }
  return grace ? "GRACE" : null;
}

/** Active(t) and Grace(t): distinct members. */
export function countStanding(data: Dataset, t: Date): { active: number; grace: number } {
  let active = 0;
  let grace = 0;
  for (const [, terms] of data.termsByMember) {
    const standing = standingAt(terms, t);
    if (standing === "ACTIVE") active += 1;
    else if (standing === "GRACE") grace += 1;
  }
  return { active, grace };
}

/** The instant a period's closing standing is read at: just before its end, and never in the future. */
export function closingInstant(to: Date, now: Date): Date {
  return new Date(Math.min(to.getTime(), now.getTime() + 1) - 1);
}

/** The earliest activation across a member's terms: when they first became a member. */
export function firstActivation(terms: PreparedTerm[] | undefined): Date | null {
  let first: Date | null = null;
  for (const term of terms ?? []) if (term.activatedAt && (!first || term.activatedAt < first)) first = term.activatedAt;
  return first;
}

/**
 * When a term lapses: the end of its grace (or its end, with no grace) when nothing renewed it. Renewed
 * (ENDED) and revoked terms never lapse; revocations are counted on their own.
 */
export function lapseInstant(term: PreparedTerm): Date | null {
  if (!term.activatedAt || term.renewed || term.revokedAt || !term.endsAt) return null;
  return term.graceUntil ?? term.endsAt;
}

/** A term that came up for renewal: it ended (or will) and was not revoked. Lifetime terms never do. */
export function isRenewable(term: PreparedTerm): boolean {
  return term.activatedAt !== null && term.endsAt !== null && term.revokedAt === null;
}

/**
 * Expired at `t` (docs/REPORTS.md "Expired"): the member holds no live term on any plan (not active, not in
 * grace, nothing paid for that starts later), and the latest term in `own` that had started by `t` ended or
 * lapsed rather than being revoked. `own` is one plan's terms on a plan row, or all of them.
 */
export function expiredAt(all: PreparedTerm[], own: PreparedTerm[], t: Date): boolean {
  if (standingAt(all, t) !== null) return false;
  if (all.some((term) => term.activatedAt && term.activatedAt <= t && term.startsAt && term.startsAt > t && !(term.revokedAt && term.revokedAt <= t))) return false;
  let latest: PreparedTerm | null = null;
  for (const term of own) if (term.activatedAt && term.startsAt && term.startsAt <= t && (!latest || term.startsAt > latest.startsAt!)) latest = term;
  return latest !== null && !(latest.revokedAt && latest.revokedAt <= t);
}
