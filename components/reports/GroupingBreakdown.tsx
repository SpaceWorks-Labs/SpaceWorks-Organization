import Link from "next/link";
import type { GroupingBreakdown as Breakdown } from "@/lib/reports/groupingBreakdown";
import { cn } from "@/lib/cn";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BarList } from "./charts/BarList";
import { ChartFrame } from "./charts/ChartFrame";

/** Members by the values of one grouping, next to the unit league: counts only, inside the viewer's own reach. */
export function GroupingBreakdown({ data, hrefFor }: { data: Breakdown; hrefFor: (groupingId: string) => string }) {
  if (!data.grouping) return null;
  const rows = data.rows;
  return (
    <section aria-labelledby="by-grouping" className="flex flex-col gap-4">
      <h2 id="by-grouping" className="text-h3 text-ink">By grouping</h2>
      {data.groupings.length > 1 ? (
        <nav aria-label="Grouping" className="flex flex-wrap gap-2">
          {data.groupings.map((entry) => (
            <Link
              key={entry.id}
              href={hrefFor(entry.id)}
              aria-current={entry.id === data.grouping?.id ? "page" : undefined}
              className={cn("inline-flex min-h-11 items-center rounded-control border px-3.5 text-sm", entry.id === data.grouping?.id ? "border-primary bg-primary font-semibold text-on-primary" : "border-line bg-panel text-ink hover:bg-muted")}
            >
              {entry.name}
            </Link>
          ))}
        </nav>
      ) : null}
      <ChartFrame
        title={`Active members by ${data.grouping.name.toLowerCase()}`}
        description="Members with a running membership (active or in grace) holding each value."
        table={{ columns: [data.grouping.name, "Members", "Active"], rows: rows.map((row) => [row.label, row.members, row.active]) }}
      >
        <BarList label={`Active members by ${data.grouping.name.toLowerCase()}`} empty="No values yet." items={rows.map((row) => ({ key: row.valueId, label: row.label, value: row.active }))} />
      </ChartFrame>
      {rows.length ? (
        <Table label={`${data.grouping.name} breakdown`}>
          <THead>
            <TR><TH>{data.grouping.name}</TH><TH className="text-right">Members</TH><TH className="text-right">Active now</TH></TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.valueId}><TD>{row.label}{row.archived ? " (archived)" : ""}</TD><TD className="text-right tabular-nums">{row.members}</TD><TD className="text-right tabular-nums">{row.active}</TD></TR>
            ))}
            <TR><TD className="text-ink-muted">No value given</TD><TD className="text-right tabular-nums">{data.unassigned}</TD><TD className="text-right text-ink-muted">—</TD></TR>
          </TBody>
        </Table>
      ) : null}
    </section>
  );
}
