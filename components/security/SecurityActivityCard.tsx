"use client";

import { useSyncExternalStore } from "react";
import { History } from "lucide-react";
import { AccountCard } from "@/components/account/AccountCard";
import { formatDate, formatDayTime, formatRelativeTime, viewerTimeZone } from "@/lib/format/datetime";

type SecurityActivityItem = { id: string; label: string; at: string };

const subscribe = () => () => {};

/**
 * The person's own recent security events: a label and a time only. Times are
 * shown in the viewer's timezone once hydrated (UTC date on the server).
 */
export function SecurityActivityCard({ items }: { items: SecurityActivityItem[] }) {
  const timeZone = useSyncExternalStore(subscribe, viewerTimeZone, () => null);
  return (
    <AccountCard id="security-activity" title="Recent security activity" description="Your latest password, two-step and session changes.">
      {items.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-line px-4 py-5 text-body-ui text-ink-muted">
          <History aria-hidden className="size-4 shrink-0" />
          No security changes recorded yet.
        </p>
      ) : (
        <ol className="flex flex-col divide-y divide-line rounded-xl border border-line">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <span className="text-label text-ink">{item.label}</span>
              <time
                dateTime={item.at}
                title={timeZone ? formatDayTime(item.at, timeZone) : undefined}
                className="shrink-0 text-caption text-ink-muted"
              >
                {timeZone ? formatRelativeTime(item.at, timeZone) : formatDate(item.at, "UTC")}
              </time>
            </li>
          ))}
        </ol>
      )}
    </AccountCard>
  );
}
