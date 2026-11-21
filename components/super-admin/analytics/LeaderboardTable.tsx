import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { OrganisationStatus } from "@prisma/client";
import type { SuperAdminLeaderboardView } from "@/lib/views/app__super-admin__analytics__leaderboard";
import { amountIn, formatAmount, formatTotals } from "@/lib/reports/money";
import { OrganisationStatusChip } from "@/components/org/OrganisationStatusChip";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { count, percent, relativeTime, shortDate, signedPercent } from "./format";
import { leaderboardHref } from "./LeaderboardControls";

type View = SuperAdminLeaderboardView;
type Sort = View["sort"];

const COLUMNS: Array<{ key: Sort | null; label: string; numeric?: boolean }> = [
  { key: "name", label: "Organisation" },
  { key: "active", label: "Active members", numeric: true },
  { key: "growth", label: "Growth", numeric: true },
  { key: "renewal", label: "Renewal rate", numeric: true },
  { key: null, label: "Renewed / lapsed", numeric: true },
  { key: "revenue", label: "Net revenue", numeric: true },
  { key: "members", label: "All members", numeric: true },
  { key: "activity", label: "Last activity", numeric: true },
  { key: "created", label: "Created", numeric: true },
];

function SortHeader({ view, column }: { view: View; column: (typeof COLUMNS)[number] }) {
  if (!column.key) return <TH className={cn(column.numeric && "text-right")}>{column.label}</TH>;
  const current = view.sort === column.key;
  const next = current ? (view.dir === "asc" ? "desc" : "asc") : column.key === "name" ? "asc" : "desc";
  const Icon = current ? (view.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TH aria-sort={current ? (view.dir === "asc" ? "ascending" : "descending") : "none"} className={cn(column.numeric && "text-right")}>
      <Link href={leaderboardHref(view, { sort: column.key, dir: next, page: 1 })} scroll={false} className={cn("inline-flex min-h-9 items-center gap-1 underline-offset-4 hover:underline", column.numeric && "flex-row-reverse")}>
        {column.label}
        <Icon aria-hidden className={cn("size-3.5 shrink-0", !current && "text-ink-muted")} />
        <span className="sr-only">
          {`, sort ${next === "asc" ? "ascending" : "descending"}`}
          {column.key === "revenue" ? ` by ${view.currency}` : ""}
        </span>
      </Link>
    </TH>
  );
}

function Revenue({ row, currency }: { row: View["rows"][number]; currency: string }) {
  const main = row.revenue.some((entry) => entry.currency === currency) ? formatAmount(amountIn(row.revenue, currency), currency) : "—";
  const others = row.revenue.filter((entry) => entry.currency !== currency);
  return (
    <>
      <span className="block">{main}</span>
      {others.length ? <span className="block text-caption text-ink-muted">{formatTotals(others)}</span> : null}
    </>
  );
}

/**
 * The organisation leaderboard: sorted on the server by the column header links (aria-sort says which way),
 * each name linking to that organisation's analytics. The table scrolls inside its own box on phones, so the
 * page never scrolls sideways. Counts and money only, never a member's details.
 */
export function LeaderboardTable({ view }: { view: View }) {
  return (
    <Table label={`Organisations, ${view.label.toLowerCase()}`}>
      <THead>
        <TR>
          {COLUMNS.map((column) => <SortHeader key={column.label} view={view} column={column} />)}
        </TR>
      </THead>
      <TBody>
        {view.rows.map((row) => (
          <TR key={row.id}>
            <TD className="min-w-48">
              <Link href={row.href} className="font-semibold text-ink underline-offset-4 hover:underline">{row.name}</Link>
              {row.status !== "ACTIVE" ? <span className="mt-0.5 block"><OrganisationStatusChip status={row.status as OrganisationStatus} /></span> : null}
            </TD>
            <TD className="text-right tabular-nums">
              {count(row.activeEnd)}
              {row.activeStart !== null ? <span className="block text-caption text-ink-muted">from {count(row.activeStart)}</span> : null}
            </TD>
            <TD className="text-right tabular-nums">{signedPercent(row.growth)}</TD>
            <TD className="text-right tabular-nums">{percent(row.renewalRate)}</TD>
            <TD className="whitespace-nowrap text-right tabular-nums">{count(row.renewed)} / {count(row.lapsed)}</TD>
            <TD className="whitespace-nowrap text-right tabular-nums"><Revenue row={row} currency={view.currency} /></TD>
            <TD className="text-right tabular-nums">{count(row.members)}</TD>
            <TD className="whitespace-nowrap text-right">
              {row.lastActivityAt ? <time dateTime={new Date(row.lastActivityAt).toISOString()} title={shortDate(row.lastActivityAt)}>{relativeTime(row.lastActivityAt, view.now)}</time> : "Never"}
            </TD>
            <TD className="whitespace-nowrap text-right">
              <time dateTime={new Date(row.createdAt).toISOString()}>{shortDate(row.createdAt)}</time>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
