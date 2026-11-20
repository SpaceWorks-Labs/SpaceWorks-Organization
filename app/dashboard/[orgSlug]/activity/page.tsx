import Link from "next/link";
import type { Metadata } from "next";
import { loadOrgActivity } from "@/lib/views/app__dashboard__orgSlug__activity__page";
import { actionLabel } from "@/lib/reports/activity";
import { targetLabel } from "@/lib/audit/targets";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { ActivityFilters } from "@/components/dashboard/activity/ActivityFilters";
import { buttonClasses } from "@/components/ui/button";
import { Callout, Chip, EmptyState } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatStamp } from "@/lib/format/datetime";

export const metadata: Metadata = { title: "Activity", robots: { index: false, follow: false } };

type Search = { actor?: string; category?: string; member?: string; from?: string; to?: string; cursor?: string };

export default async function OrgActivityPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<Search> }) {
  const view = await loadOrgActivity({ params, searchParams });
  const base = `/dashboard/${view.org.slug}/activity`;
  const keep = Object.entries({ actor: view.selected.actor, category: view.selected.category, member: view.selected.member, from: view.selected.from, to: view.selected.to }).filter(([, value]) => value);
  const href = (entries: Array<[string, string]>) => (entries.length ? `${base}?${new URLSearchParams(entries).toString()}` : base);
  const categoryLabel = new Map<string, string>(view.categories.map((category) => [category.key, category.label]));
  return (
    <div className="flex flex-col gap-5">
      <OrgPageHeader
        organisation={view.org}
        title="Activity"
        description={view.limited ? "What happened to the members in your reach: team actions, members' own changes and automatic ones." : "Everything recorded for this organisation: team actions, members' own changes and automatic ones."}
      />
      {view.selected.member ? (
        <Callout tone="info" action={<Link href={href(keep.filter(([key]) => key !== "member"))} className={buttonClasses({ variant: "secondary", size: "sm" })}>Show everyone</Link>}>
          Showing what happened to <span className="font-semibold">{view.filterMemberName}</span>.
        </Callout>
      ) : null}
      <ActivityFilters actors={view.actors} categories={view.categories} initial={view.selected} />
      {view.rows.length === 0 ? (
        view.filtered ? (
          <EmptyState mood="sleepy" title="Nothing matches these filters" action={<Link href={base} scroll={false} className={buttonClasses({ variant: "secondary" })}>Clear filters</Link>}>
            Try another person, kind of action or dates, or clear the filters.
          </EmptyState>
        ) : (
          <EmptyState mood="sleepy" title="Nothing recorded yet">Actions by the team, by members and by the system appear here as they happen.</EmptyState>
        )
      ) : (
        <Table label="Organisation activity">
          <THead><tr><TH>When</TH><TH>Who</TH><TH>What</TH><TH>About</TH></tr></THead>
          <TBody>
            {view.rows.map((row) => (
              <TR key={row.id}>
                <TD className="whitespace-nowrap text-ink-secondary">{formatStamp(row.when, view.timeZone)}</TD>
                <TD>
                  <span className="text-ink">{row.who}</span>
                  {row.memberInitiated ? <Chip size="sm" tone="info" className="ml-2">Member</Chip> : null}
                </TD>
                <TD>
                  <span className="text-ink">{actionLabel(row.action)}</span>
                  <span className="block text-caption text-ink-muted">{categoryLabel.get(row.category) ?? "Other"}</span>
                </TD>
                <TD>
                  {row.subject ? <Link href={row.subject.href} className="text-ink underline-offset-4 hover:underline">{row.subject.name}</Link> : null}
                  {row.href && row.href !== row.subject?.href ? (
                    <Link href={row.href} className={row.subject ? "block text-caption text-ink-muted underline-offset-4 hover:underline" : "text-ink underline-offset-4 hover:underline"}>{targetLabel(row.targetType)}</Link>
                  ) : !row.subject ? <span className="text-ink-muted">{targetLabel(row.targetType)}</span> : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {view.next || view.paged ? (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-sm">
          <Link href={href(keep)} className={buttonClasses({ variant: "ghost", size: "sm" })}>Back to newest</Link>
          {view.next ? <Link href={href([...keep, ["cursor", view.next]])} className={buttonClasses({ variant: "secondary", size: "sm" })}>Older activity</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
