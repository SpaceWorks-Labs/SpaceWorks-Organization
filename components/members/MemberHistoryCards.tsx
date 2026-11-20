import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/display";
import { formatCalendarDate, localDate } from "@/lib/membership/periods";
import type { MemberActivityRow, MemberMessageRow } from "@/lib/views/memberHistory";

const day = (date: Date, timeZone: string) => formatCalendarDate(localDate(date, timeZone));

/** The messages this member was sent: what, how, and whether it arrived. Never the wording. */
export function MemberMessagesCard({ messages, timeZone }: { messages: readonly MemberMessageRow[]; timeZone: string }) {
  return (
    <Card as="section" className="rounded-xl">
      <CardHeader title="Messages" description="Latest 30 sent to this member." />
      {messages.length === 0 ? <p className="text-body-ui text-ink-muted">Nothing sent yet.</p> : (
        <ul className="flex flex-col gap-3">
          {messages.map((message) => (
            <li key={message.id} className="flex flex-col border-l-2 border-line pl-4">
              <span className="text-label font-semibold text-ink">{message.kind}</span>
              <span className="text-caption text-ink-muted">
                {message.status}{message.channel ? ` by ${message.channel}` : ""}{message.delivery && message.delivery !== "sent" ? `, ${message.delivery}` : ""} · {day(message.when, timeZone)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** This member's audit events, with a link to the full log filtered to them. */
export function MemberActivityCard({ slug, memberId, activity, timeZone }: { slug: string; memberId: string; activity: readonly MemberActivityRow[]; timeZone: string }) {
  return (
    <Card as="section" className="rounded-xl">
      <CardHeader
        title="Activity"
        action={<Link href={`/dashboard/${slug}/activity?member=${memberId}`} className="text-label text-ink-muted underline-offset-4 hover:text-ink hover:underline">View all activity</Link>}
      />
      {activity.length === 0 ? <p className="text-body-ui text-ink-muted">Nothing recorded yet.</p> : (
        <ol className="flex flex-col gap-3">
          {activity.map((event) => (
            <li key={event.id} className="flex flex-col border-l-2 border-line pl-4">
              <span className="text-label font-semibold text-ink">{event.label}</span>
              <span className="text-caption text-ink-muted">{day(event.when, timeZone)}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
