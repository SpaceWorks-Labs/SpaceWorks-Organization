import Link from "next/link";
import type { Metadata } from "next";
import { Download, Plus, Upload } from "lucide-react";
import { loadOrgMembersDirectory } from "@/lib/views/app__dashboard__orgSlug__members__page";
import { MEMBER_FILTERS, type MemberFilter } from "@/lib/membership/describe";
import { formatCalendarDate, lastValidDay } from "@/lib/membership/periods";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { MemberFilters } from "@/components/members/MemberFilters";
import { MembersTable } from "@/components/members/MembersTable";
import { CardExportButton } from "@/components/cards/CardExportButton";
import { buttonClasses } from "@/components/ui/button";
import { Callout, EmptyState } from "@/components/ui/display";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Members", robots: { index: false, follow: false } };

const FILTER_LABELS: Record<MemberFilter, string> = {
  all: "Everyone",
  active: "Active",
  approval: "Waiting for approval",
  payment: "Waiting for payment",
  grace: "In grace",
  lapsed: "Lapsed",
  expiring: "Ending in 30 days",
};

type Props = { params: Promise<{ orgSlug: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function OrgMembersDirectoryPage({ params, searchParams }: Props) {
  const view = await loadOrgMembersDirectory({ params, searchParams });
  const { org, filter, counts, rows, page, pages, total } = view;
  const base = `/dashboard/${org.slug}/members`;
  const query = (patch: Record<string, string | number>) => {
    const next = new URLSearchParams();
    const merged = { ...view.drill?.params, status: filter === "all" ? "" : filter, q: view.q, plan: view.selected.plan, unit: view.selected.unit, role: view.selected.role, ...patch };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, String(value));
    const text = next.toString();
    return text ? `${base}?${text}` : base;
  };
  const validUntil = Object.fromEntries(rows.flatMap((row) => row.standings.filter((s) => s.endsAt && ["ACTIVE", "GRACE", "UPCOMING"].includes(s.status)).map((s) => [`${row.id}:${s.planId}`, formatCalendarDate(lastValidDay(s.endsAt!, org.timezone))])));

  return (
    <div className="flex flex-col gap-5">
      <OrgPageHeader
        organisation={org}
        title="Members"
        description={`${counts.all.toLocaleString("en-IN")} ${counts.all === 1 ? "person" : "people"}${view.scopedUnit ? " in your unit" : ""}.`}
        actions={
          <div className="flex flex-wrap gap-2">
            {view.canExport ? (
              <a href={`/api/exports/members/${org.slug}`} className={buttonClasses({ variant: "secondary" })}>
                <Download aria-hidden className="size-4" />
                Export
              </a>
            ) : null}
            {/* A report drill-down narrows the list in ways the card download can't follow, so it waits for a plain filter. */}
            {view.canManageCards && !view.drill ? (
              <CardExportButton
                slug={org.slug}
                filter={{ status: filter, planId: view.selected.plan || null, unitId: view.selected.unit || null, roleId: view.selected.role || null, q: view.q }}
                description={filter === "all" && !view.q && !view.selected.plan && !view.selected.unit && !view.selected.role ? "every member with a card" : "the members this filter shows"}
              />
            ) : null}
            {view.canManage ? (
              <>
                <Link href={`${base}/import`} className={buttonClasses({ variant: "secondary" })}>
                  <Upload aria-hidden className="size-4" />
                  Import
                </Link>
                <Link href={`${base}/new`} className={buttonClasses({ variant: "primary" })}>
                  <Plus aria-hidden className="size-4" />
                  Add member
                </Link>
              </>
            ) : null}
          </div>
        }
      />

      <nav aria-label="Filter members" className="flex flex-wrap gap-2">
        {MEMBER_FILTERS.map((key) => (
          <Link
            key={key}
            href={query({ status: key === "all" ? "" : key, page: "" })}
            aria-current={filter === key ? "page" : undefined}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors",
              filter === key ? "border-primary bg-primary font-semibold text-on-primary" : "border-line bg-panel text-ink hover:bg-muted",
              key !== "all" && counts[key] === 0 && filter !== key && "opacity-60",
            )}
          >
            {FILTER_LABELS[key]} <span className="tabular-nums">{counts[key]}</span>
          </Link>
        ))}
      </nav>

      {view.drill ? (
        <Callout tone="info" action={<Link href={base} className={buttonClasses({ variant: "secondary", size: "sm" })}>Show everyone</Link>}>
          From reports: <span className="font-semibold">{view.drill.label}</span>. {total.toLocaleString("en-IN")} {total === 1 ? "member" : "members"}.
        </Callout>
      ) : null}

      <MemberFilters plans={view.plans} units={view.units} roles={view.roles} initial={{ q: view.q, ...view.selected }} />

      {counts.approval > 0 && filter !== "approval" && view.canManage ? (
        <Callout tone="info" action={<Link href={query({ status: "approval", page: "" })} className={buttonClasses({ variant: "secondary", size: "sm" })}>Verify</Link>}>
          {counts.approval} {counts.approval === 1 ? "person is" : "people are"} waiting for approval. Check their details, then verify or decline.
        </Callout>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState {...(total === 0 && filter === "all" && !view.q ? { patch: true } : { mood: "sleepy" as const })} title={total === 0 && filter === "all" && !view.q ? "No members yet" : "Nobody matches"}>
          {total === 0 && filter === "all" && !view.q ? "Share a plan's join link, add people by hand, or import a spreadsheet." : "Try another filter or search."}
        </EmptyState>
      ) : (
        <MembersTable slug={org.slug} rows={rows} canManage={view.canManage} showUnit={view.units.length > 0} validUntil={validUntil} />
      )}

      {pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ink-muted">Page {page} of {pages}</span>
          <span className="flex gap-2">
            {page > 1 ? <Link href={query({ page: page - 1 })} className={buttonClasses({ variant: "secondary", size: "sm" })}>Previous</Link> : null}
            {page < pages ? <Link href={query({ page: page + 1 })} className={buttonClasses({ variant: "secondary", size: "sm" })}>Next</Link> : null}
          </span>
        </nav>
      ) : null}
    </div>
  );
}
