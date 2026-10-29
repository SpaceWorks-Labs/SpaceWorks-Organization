import { formatCalendarDate, lastValidDay, localDate } from "@/lib/membership/periods";
import { money } from "@/lib/membership/describe";
import type { TermStatus } from "@/lib/membership/lifecycle";
import { historyLine } from "@/lib/portal/history";
import { TermStatusChip } from "@/components/members/TermStatusChip";

type HistoryTerm = {
  id: string;
  kind: string;
  status: TermStatus;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
  currency: string;
  amountMinor: number;
  reason: string | null;
  events: Array<{ id: string; to: TermStatus; effectiveAt: Date; cause: string }>;
};

const KIND: Record<string, string> = { NEW: "Joined", RENEWAL: "Renewal", REINSTATEMENT: "Reinstated" };

/** Each period of one membership, newest first, with the changes it went through. */
export function MembershipHistory({ terms, timeZone, locale }: { terms: HistoryTerm[]; timeZone: string; locale: string | null }) {
  const day = (date: Date) => formatCalendarDate(localDate(date, timeZone));
  return (
    <ol className="flex flex-col gap-4">
      {terms.map((term) => (
        <li key={term.id} className="flex flex-col gap-3 rounded-lg border border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-label font-semibold text-ink">
                {term.startsAt ? `${day(term.startsAt)} – ${term.endsAt ? formatCalendarDate(lastValidDay(term.endsAt, timeZone)) : "no end date"}` : `Opened ${day(term.createdAt)}`}
              </p>
              <p className="text-caption text-ink-muted">
                {KIND[term.kind] ?? term.kind} · {term.amountMinor === 0 ? "Free" : money(term.amountMinor, term.currency, locale)}
              </p>
            </div>
            <TermStatusChip status={term.status} />
          </div>
          {term.reason ? <p className="text-body-ui text-ink-secondary">Note: {term.reason}</p> : null}
          {term.events.length ? (
            <ol aria-label="Changes" className="flex flex-col gap-2 border-l-2 border-line pl-4">
              {term.events.map((event) => (
                <li key={event.id} className="flex flex-col">
                  <span className="text-body-ui text-ink">{historyLine(event)}</span>
                  <time className="text-caption text-ink-muted" dateTime={event.effectiveAt.toISOString()}>{day(event.effectiveAt)}</time>
                </li>
              ))}
            </ol>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
