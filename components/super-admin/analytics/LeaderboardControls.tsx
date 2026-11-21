import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { SuperAdminLeaderboardView } from "@/lib/views/app__super-admin__analytics__leaderboard";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { rangeParam } from "./AnalyticsShell";
import { humanise, withQuery } from "./format";
import { Control, LinkChoices } from "./parts";

type View = SuperAdminLeaderboardView;
type Query = { range: string; sort: string; dir: string; status: string; currency: string; pageSize: number; page: number };

const PATH = "/super-admin/analytics/organisations";

/** A leaderboard link with one or more choices changed; defaults are left out so the address stays short. */
export function leaderboardHref(view: View, patch: Partial<Query>): string {
  const next: Query = { range: view.range, sort: view.sort, dir: view.dir, status: view.status, currency: view.currency, pageSize: view.pageSize, page: view.page, ...patch };
  const defaultDir = next.sort === "name" ? "asc" : "desc";
  return withQuery(PATH, {
    range: rangeParam(next.range as View["range"]),
    sort: next.sort === "active" ? undefined : next.sort,
    dir: next.dir === defaultDir ? undefined : next.dir,
    status: next.status === "all" ? undefined : next.status,
    currency: next.currency === view.currencies[0] ? undefined : next.currency,
    pageSize: next.pageSize === 20 ? undefined : next.pageSize,
    page: next.page > 1 ? next.page : undefined,
  });
}

const STATUS_LABELS: Record<string, string> = { all: "All", active: "Active", suspended: "Suspended" };

/** Status filter, the currency revenue is shown and sorted in, and the page size. Every choice is a link, so it lives in the address. */
export function LeaderboardControls({ view }: { view: View }) {
  return (
    <>
      <Control label="Status">
        <LinkChoices label="Status" options={view.statuses.map((status) => ({ href: leaderboardHref(view, { status, page: 1 }), label: STATUS_LABELS[status] ?? humanise(status), current: status === view.status }))} />
      </Control>
      {view.currencies.length > 1 ? (
        <Control label="Revenue in">
          <LinkChoices label="Revenue currency" options={view.currencies.map((currency) => ({ href: leaderboardHref(view, { currency, page: 1 }), label: currency, current: currency === view.currency }))} />
        </Control>
      ) : null}
      <Control label="Rows a page">
        <LinkChoices label="Rows a page" options={view.pageSizes.map((size) => ({ href: leaderboardHref(view, { pageSize: size, page: 1 }), label: String(size), current: size === view.pageSize }))} />
      </Control>
    </>
  );
}

function PagerLink({ href, label, direction }: { href: string | null; label: string; direction: "previous" | "next" }) {
  const icon = direction === "previous" ? <ChevronLeft aria-hidden className="size-4" /> : <ChevronRight aria-hidden className="size-4" />;
  const body = direction === "previous" ? <>{icon}{label}</> : <>{label}{icon}</>;
  return href ? (
    <Link href={href} scroll={false} className={buttonClasses({ variant: "secondary", size: "sm" })}>{body}</Link>
  ) : (
    <span aria-disabled="true" className={cn(buttonClasses({ variant: "secondary", size: "sm" }), "pointer-events-none border-line bg-surface text-ink-muted")}>{body}</span>
  );
}

/** "21–40 of 248" with Previous and Next (kit pagination). */
export function LeaderboardPager({ view }: { view: View }) {
  if (!view.total) return null;
  const first = (view.page - 1) * view.pageSize + 1;
  const last = Math.min(view.total, view.page * view.pageSize);
  return (
    <nav aria-label="Leaderboard pages" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-label text-ink-secondary tabular-nums">
        {first.toLocaleString("en-IN")}–{last.toLocaleString("en-IN")} of {view.total.toLocaleString("en-IN")} organisations
        {view.pageCount > 1 ? <span className="text-ink-muted"> · page {view.page} of {view.pageCount}</span> : null}
      </p>
      {view.pageCount > 1 ? (
        <div className="flex gap-2">
          <PagerLink direction="previous" label="Previous" href={view.page > 1 ? leaderboardHref(view, { page: view.page - 1 }) : null} />
          <PagerLink direction="next" label="Next" href={view.page < view.pageCount ? leaderboardHref(view, { page: view.page + 1 }) : null} />
        </div>
      ) : null}
    </nav>
  );
}
