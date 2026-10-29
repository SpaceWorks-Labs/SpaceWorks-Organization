import { deriveStatus, statusAt, type TermLike, type TermStatus } from "@/lib/membership/lifecycle";
import { canRenewNow, lastValidDay, renewalStartDay, termWindow, type CalendarDate } from "@/lib/membership/periods";

/**
 * What the member wallet shows for one membership (a member's terms on one plan) and which actions it
 * offers. Pure and client-safe; the server actions re-check every rule before acting.
 */

const DAY_MS = 86_400_000;

export type WalletTerm = TermLike & { kind: "NEW" | "RENEWAL" | "REINSTATEMENT" };

export type WalletPlan = {
  durationType: "ROLLING" | "ORG_YEAR" | "FIXED_END" | "LIFETIME";
  renewalWindowDays: number;
  joinMode: "OPEN" | "APPROVAL" | "INVITE_ONLY" | "CLOSED";
  archivedAt: Date | null;
  /** Without these (not selected), a fixed-end plan's end date is not checked here; startRenewal still is. */
  fixedEndDate: Date | null;
  lateRenewalBackdate: boolean;
};

export type WalletState = {
  status: TermStatus | "NONE";
  currentTermId: string | null;
  /** Last valid day of the current term (null: lifetime, or not started). */
  validUntil: CalendarDate | null;
  /** Last valid day of a paid renewal that has not started yet. */
  renewedUntil: CalendarDate | null;
  /** Whole days until the current term ends (ACTIVE) or its grace ends (GRACE). */
  daysLeft: number | null;
  /** When the renewal window opens, if it hasn't yet. */
  renewalOpensAt: Date | null;
  actions: {
    renew: boolean;
    rejoin: boolean;
    /** An unpaid term the member can pay for. */
    payTermId: string | null;
    /** An application, unpaid term or paid-early renewal the member can call off. */
    withdrawTermId: string | null;
    withdrawKind: "application" | "renewal" | null;
    leave: boolean;
  };
};

const REJOINABLE: ReadonlySet<TermStatus | "NONE"> = new Set(["LAPSED", "EXPIRED", "CANCELLED"]);

/**
 * `unpaidLive` holds terms that started before payment (plans that activate first and charge later) and have
 * no settled payment yet; the wallet offers Pay for those too.
 */
export function walletState(chain: WalletTerm[], plan: WalletPlan, args: { now: Date; timeZone: string; organisationActive: boolean; unpaidLive?: ReadonlySet<string> }): WalletState {
  const { now, timeZone } = args;
  const derived = deriveStatus(chain, now);
  const current = derived.current;
  const pendingStatus = derived.pending ? statusAt(derived.pending, now) : null;
  const offered = args.organisationActive && !plan.archivedAt;
  const live = derived.status === "ACTIVE" || derived.status === "GRACE";

  const until = (term: TermLike | null) => (term?.endsAt && term.startsAt ? lastValidDay(term.endsAt, timeZone) : null);
  const deadline = derived.status === "ACTIVE" ? current?.endsAt : derived.status === "GRACE" ? current?.graceUntil : null;
  const daysLeft = deadline ? Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / DAY_MS)) : null;

  const blocked = Boolean(derived.pending || derived.upcoming);
  const renewable = live && plan.durationType !== "LIFETIME" && Boolean(current?.endsAt);
  const windowOpen = renewable && canRenewNow(current!.endsAt, current!.graceUntil, plan.renewalWindowDays, now);
  // A fixed-end plan can't renew once the next term would start after its last day.
  const backdate = { lateRenewalBackdate: plan.lateRenewalBackdate };
  const pastFixedEnd = renewable && plan.durationType === "FIXED_END"
    && !termWindow({ ...backdate, durationType: "FIXED_END", fixedEndDate: plan.fixedEndDate, graceDays: 0, renewalWindowDays: 0 }, renewalStartDay(current!, backdate, now, timeZone), timeZone, 1);
  const opensAt = renewable && !pastFixedEnd && !windowOpen && current!.endsAt ? new Date(current!.endsAt.getTime() - plan.renewalWindowDays * DAY_MS) : null;

  const withdrawable = derived.pending ?? derived.upcoming;
  const withdrawKind = withdrawable ? (withdrawable.kind === "RENEWAL" ? "renewal" : "application") : null;

  return {
    status: derived.status,
    currentTermId: current?.id ?? null,
    validUntil: until(current && current.status !== "PENDING_APPROVAL" && current.status !== "PENDING_PAYMENT" ? current : null),
    renewedUntil: until(derived.upcoming),
    daysLeft,
    renewalOpensAt: opensAt && opensAt > now ? opensAt : null,
    actions: {
      renew: offered && windowOpen && !blocked && !pastFixedEnd,
      rejoin: offered && !blocked && REJOINABLE.has(derived.status) && (plan.joinMode === "OPEN" || plan.joinMode === "APPROVAL"),
      payTermId: pendingStatus === "PENDING_PAYMENT" ? derived.pending!.id : current && args.unpaidLive?.has(current.id) ? current.id : null,
      withdrawTermId: withdrawable?.id ?? null,
      withdrawKind,
      leave: live,
    },
  };
}

/** Terms on activate-then-charge plans that are running with nothing paid yet. */
export function unpaidLiveTerms(terms: Array<{ id: string; status: string; priceMinor: number; joiningFeeMinor: number; payments: Array<{ status: string }>; plan: { paymentTiming: string } }>) {
  return new Set(terms.filter((term) => term.plan.paymentTiming === "ACTIVATE_THEN_CHARGE" && term.priceMinor + term.joiningFeeMinor > 0 && ["UPCOMING", "ACTIVE", "GRACE"].includes(term.status) && !term.payments.some((payment) => ["PAID", "WAIVED", "AWAITING_CONFIRMATION"].includes(payment.status))).map((term) => term.id));
}
