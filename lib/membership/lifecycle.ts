/**
 * Membership status rules. Pure and client-safe. The stored term status is a cache the sweep keeps
 * aligned; `statusAt` and `deriveStatus` are the source of truth for what a member is right now.
 */

export type TermStatus =
  | "PENDING_APPROVAL"
  | "PENDING_PAYMENT"
  | "UPCOMING"
  | "ACTIVE"
  | "GRACE"
  | "ENDED"
  | "LAPSED"
  | "EXPIRED"
  | "CANCELLED"
  | "REJECTED"
  | "REVOKED";

export type TermKind = "NEW" | "RENEWAL" | "REINSTATEMENT";

export type TermLike = {
  id: string;
  status: TermStatus;
  kind?: TermKind;
  startsAt: Date | null;
  endsAt: Date | null;
  graceUntil: Date | null;
  paymentDueBy?: Date | null;
  renewedFromId?: string | null;
  createdAt: Date;
};

/** Statuses whose meaning changes with the clock. */
export const TIMED_STATUSES: ReadonlySet<TermStatus> = new Set(["UPCOMING", "ACTIVE", "GRACE"]);
export const PENDING_STATUSES: ReadonlySet<TermStatus> = new Set(["PENDING_APPROVAL", "PENDING_PAYMENT"]);

/**
 * What a term's status is at `now`, from its dates. Only timed statuses move; a pending payment past its
 * due date becomes EXPIRED. `hasPaidSuccessor` turns a finished term into ENDED rather than LAPSED.
 */
export function statusAt(term: TermLike, now: Date, hasPaidSuccessor = false): TermStatus {
  if (term.status === "PENDING_PAYMENT" && term.paymentDueBy && now >= term.paymentDueBy) return "EXPIRED";
  if (!TIMED_STATUSES.has(term.status)) return term.status;
  if (!term.startsAt) return term.status;
  if (now < term.startsAt) return "UPCOMING";
  if (!term.endsAt || now < term.endsAt) return "ACTIVE";
  if (hasPaidSuccessor) return "ENDED";
  if (term.graceUntil && now < term.graceUntil) return "GRACE";
  return "LAPSED";
}

type DerivedStatus = {
  /** The member's standing on this plan right now. NONE when they never held a term. */
  status: TermStatus | "NONE";
  /** The term that decides `status`. */
  current: TermLike | null;
  /** A paid early renewal waiting to start. */
  upcoming: TermLike | null;
  /** An open application or unpaid term. */
  pending: TermLike | null;
};

/**
 * A member's standing on one plan from all their terms on it. The current term is the latest live term
 * covering now; failing that, the most recent decided term, read at `now`.
 */
export function deriveStatus(chain: TermLike[], now: Date): DerivedStatus {
  const successors = new Set(chain.filter((term) => term.renewedFromId && (TIMED_STATUSES.has(term.status) || term.status === "ENDED")).map((term) => term.renewedFromId!));
  const read = (term: TermLike) => statusAt(term, now, successors.has(term.id));
  const byStart = [...chain].sort((a, b) => (b.startsAt?.getTime() ?? b.createdAt.getTime()) - (a.startsAt?.getTime() ?? a.createdAt.getTime()));

  const pending = byStart.find((term) => PENDING_STATUSES.has(read(term))) ?? null;
  const upcoming = byStart.find((term) => read(term) === "UPCOMING") ?? null;
  const live = byStart.find((term) => ["ACTIVE", "GRACE"].includes(read(term)));
  if (live) return { status: read(live), current: live, upcoming, pending };

  const decided = [...chain]
    .filter((term) => !PENDING_STATUSES.has(read(term)) && read(term) !== "UPCOMING")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (decided) return { status: read(decided), current: decided, upcoming, pending };
  if (upcoming) return { status: "UPCOMING", current: upcoming, upcoming, pending };
  if (pending) return { status: read(pending), current: pending, upcoming: null, pending };
  return { status: "NONE", current: null, upcoming: null, pending: null };
}

/** Manager and system actions on a term, and the statuses each may start from. */
export const TRANSITIONS = {
  approve: ["PENDING_APPROVAL"],
  reject: ["PENDING_APPROVAL"],
  /** Payment received (P7 calls this from webhooks and offline confirmation). */
  markPaid: ["PENDING_PAYMENT", "EXPIRED"],
  /** Withdraw an application or unpaid term. Paid terms are revoked, never cancelled. */
  cancel: ["PENDING_APPROVAL", "PENDING_PAYMENT"],
  revoke: ["UPCOMING", "ACTIVE", "GRACE"],
  reinstate: ["REVOKED"],
  extend: ["UPCOMING", "ACTIVE", "GRACE", "LAPSED"],
  /** The member calls it off from their account: an application, an unpaid or paid-early term, or leaving. */
  withdraw: ["PENDING_APPROVAL", "PENDING_PAYMENT", "UPCOMING", "ACTIVE", "GRACE"],
} as const satisfies Record<string, readonly TermStatus[]>;

export type TermAction = keyof typeof TRANSITIONS;

export function canTransition(action: TermAction, status: TermStatus): boolean {
  return (TRANSITIONS[action] as readonly TermStatus[]).includes(status);
}

type RejoinFeeRule = "NEVER" | "ONCE" | "EACH_JOIN" | "AFTER_LAPSE";

/**
 * Whether a new (not renewal) term charges the joining fee, given the member's earlier terms on the plan.
 * NEVER: only the very first join. ONCE: same as NEVER for the fee itself (kept for clarity in the editor).
 * EACH_JOIN: every new term. AFTER_LAPSE: again when the last term ended more than `rejoinAfterDays` ago.
 */
export function chargesJoiningFee(
  rule: RejoinFeeRule,
  history: Array<Pick<TermLike, "status" | "endsAt" | "graceUntil">>,
  now: Date,
  rejoinAfterDays: number | null | undefined,
): boolean {
  const held = history.filter((term) => !["PENDING_APPROVAL", "PENDING_PAYMENT", "EXPIRED", "CANCELLED", "REJECTED"].includes(term.status));
  if (held.length === 0) return true;
  if (rule === "EACH_JOIN") return true;
  if (rule === "AFTER_LAPSE") {
    const lastEnd = held.reduce<number>((latest, term) => Math.max(latest, (term.graceUntil ?? term.endsAt)?.getTime() ?? Infinity), 0);
    if (lastEnd === Infinity) return false;
    return now.getTime() - lastEnd > (rejoinAfterDays ?? 0) * 86_400_000;
  }
  return false;
}

/** Words for each status, for chips and filters. */
export const TERM_STATUS_LABELS: Record<TermStatus | "NONE", string> = {
  PENDING_APPROVAL: "Waiting for approval",
  PENDING_PAYMENT: "Waiting for payment",
  UPCOMING: "Starts soon",
  ACTIVE: "Active",
  GRACE: "In grace",
  ENDED: "Renewed",
  LAPSED: "Lapsed",
  EXPIRED: "Payment expired",
  CANCELLED: "Cancelled",
  REJECTED: "Declined",
  REVOKED: "Revoked",
  NONE: "No membership",
};

export const TERM_STATUS_TONES: Record<TermStatus | "NONE", "success" | "warning" | "info" | "danger" | "neutral"> = {
  PENDING_APPROVAL: "info",
  PENDING_PAYMENT: "warning",
  UPCOMING: "info",
  ACTIVE: "success",
  GRACE: "warning",
  ENDED: "neutral",
  LAPSED: "danger",
  EXPIRED: "neutral",
  CANCELLED: "neutral",
  REJECTED: "danger",
  REVOKED: "danger",
  NONE: "neutral",
};
