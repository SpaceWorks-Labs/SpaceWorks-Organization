import Link from "next/link";
import { ArrowDown, ArrowUp, Moon } from "lucide-react";
import type { SuperAdminAnalyticsView } from "@/lib/views/app__super-admin__analytics__page";
import type { SortKey } from "@/lib/reports/platformAnalytics";
import { formatValue } from "@/lib/reports/chartScale";
import { formatTotals } from "@/lib/reports/money";
import { Chip } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "name", label: "Organisation" },
  { key: "active", label: "Active" },
  { key: "growth30", label: "30 days" },
  { key: "growth90", label: "90 days" },
  { key: "renewal", label: "Renewal rate" },
  { key: "revenue", label: "Revenue, 12 months" },
  { key: "outstanding", label: "Outstanding" },
  { key: "signin", label: "Last staff sign-in" },
  { key: "payment", label: "Last payment" },
  { key: "limits", label: "Limits used" },
];

const day = (date: Date | null) => (date ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(date)) : "Never");
const growth = (rate: number | null) => (rate === null ? "—" : `${rate > 0 ? "+" : rate < 0 ? "−" : ""}${Math.abs(Math.round(rate * 100))}%`);

/**
 * Every organisation side by side, sorted on the server by the column header links (each header says which
 * way it sorts). Money columns list each currency on its own and sort by the platform's main currency.
 */
export function ComparisonTable({ view }: { view: SuperAdminAnalyticsView }) {
  const { key, dir } = view.sort;
  const href = (column: SortKey) => `/super-admin/analytics?sort=${column}&dir=${column === key ? (dir === "asc" ? "desc" : "asc") : column === "name" ? "asc" : "desc"}`;
  return (
    <Table label="Organisations compared">
      <THead>
        <TR>
          {COLUMNS.map((column, index) => (
            <TH key={column.key} aria-sort={column.key === key ? (dir === "asc" ? "ascending" : "descending") : undefined} className={index > 0 ? "whitespace-nowrap text-right" : "whitespace-nowrap"}>
              <Link href={href(column.key)} className="inline-flex min-h-9 items-center gap-1 underline-offset-4 hover:underline">
                {column.label}
                {column.key === key ? dir === "asc" ? <ArrowUp aria-hidden className="size-3.5" /> : <ArrowDown aria-hidden className="size-3.5" /> : null}
                {column.key === "revenue" || column.key === "outstanding" ? <span className="sr-only">, sorted by {view.currencies[0] ?? "the main currency"}</span> : null}
              </Link>
            </TH>
          ))}
        </TR>
      </THead>
      <TBody>
        {view.rows.map((row) => (
          <TR key={row.id}>
            <TD>
              <Link href={`/super-admin/orgs/${row.id}/analytics`} className="font-semibold text-ink underline-offset-4 hover:underline">{row.name}</Link>
              <span className="mt-0.5 flex flex-wrap gap-1">
                {row.status !== "ACTIVE" ? <Chip size="sm" tone="warning">Suspended</Chip> : null}
                {row.dormant ? <Chip size="sm" tone="neutral" icon={<Moon aria-hidden className="size-3" />}>Dormant</Chip> : null}
              </span>
            </TD>
            <TD className="text-right tabular-nums">{row.active === null ? "—" : row.active.toLocaleString("en-IN")}</TD>
            <TD className="text-right tabular-nums">{growth(row.growth30)}</TD>
            <TD className="text-right tabular-nums">{growth(row.growth90)}</TD>
            <TD className="text-right tabular-nums">{formatValue(row.renewalRate, "percent")}</TD>
            <TD className="whitespace-nowrap text-right tabular-nums">{formatTotals(row.revenue)}</TD>
            <TD className="whitespace-nowrap text-right tabular-nums">{formatTotals(row.outstanding)}</TD>
            <TD className="whitespace-nowrap text-right">{day(row.lastSignIn)}</TD>
            <TD className="whitespace-nowrap text-right">{day(row.lastPayment)}</TD>
            <TD className="whitespace-nowrap text-right tabular-nums">{row.limitShare === null ? "No limits" : formatValue(row.limitShare, "percent")}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
