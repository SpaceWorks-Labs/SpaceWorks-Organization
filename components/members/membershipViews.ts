import { money } from "@/lib/membership/describe";
import { formatCalendarDate, lastValidDay, localDate } from "@/lib/membership/periods";
import type { loadMemberView } from "@/lib/views/app__dashboard__orgSlug__members__memberId__page";
import type { MembershipView } from "./MembershipPanel";

type Loaded = Awaited<ReturnType<typeof loadMemberView>>;

/** A member's memberships, as loaded for their page, formatted for MembershipPanel in the organisation's timezone. */
export function membershipViews(memberships: Loaded["memberships"], org: Pick<Loaded["org"], "timezone" | "locale">): MembershipView[] {
  const tz = org.timezone;
  const day = (date: Date) => formatCalendarDate(localDate(date, tz));
  return memberships.map((membership) => ({
    planId: membership.planId,
    planName: membership.planName,
    status: membership.status,
    terms: membership.terms.map((term) => ({
      id: term.id,
      status: term.liveStatus,
      kind: term.kind,
      dates: term.startsAt ? `${day(term.startsAt)} – ${term.endsAt ? formatCalendarDate(lastValidDay(term.endsAt, tz)) : "lifetime"}` : `Opened ${day(term.createdAt)}`,
      amount: term.priceMinor + term.joiningFeeMinor === 0 ? "Free" : money(term.priceMinor + term.joiningFeeMinor, term.currency, org.locale),
      reason: term.reason,
      lastDay: term.endsAt ? (() => { const d = lastValidDay(term.endsAt, tz); return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`; })() : null,
    })),
  }));
}
