import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";

type TableView = { columns: string[]; rows: Array<Array<string | number>>; caption?: string };

/** A plain table for a chart's numbers: the accessible twin of every chart, and its print fallback. */
export function DataTable({ table, className }: { table: TableView; className?: string }) {
  return (
    <div className={cn("w-full overflow-x-auto rounded-lg border border-line", className)}>
      <table className="w-full border-collapse text-left text-label">
        {table.caption ? <caption className="sr-only">{table.caption}</caption> : null}
        <thead className="bg-surface">
          <tr>
            {table.columns.map((column, index) => (
              <th key={column} scope="col" className={cn("whitespace-nowrap border-b border-line px-3 py-2 font-semibold text-accent-text", index > 0 && "text-right")}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r} className="[&:last-child>td]:border-b-0">
              {row.map((cell, c) => (
                <td key={c} className={cn("whitespace-nowrap border-b border-line px-3 py-1.5 text-ink", c > 0 && "text-right tabular-nums")}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The card every chart sits in: a title that names what is plotted, an optional one-line reading of it,
 * a drill-down link, the chart, and a "Show as table" disclosure with the same numbers.
 */
export function ChartFrame({ title, description, drill, table, children, className, action }: { title: string; description?: ReactNode; drill?: { href: string; label?: string }; table?: TableView; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <figure className={cn("sw-chart flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-panel p-4 sm:p-5", className)}>
      <figcaption className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <span className="min-w-0">
          <span className="block text-title text-ink">{title}</span>
          {description ? <span className="mt-0.5 block text-label text-ink-muted">{description}</span> : null}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {action}
          {drill ? (
            <Link href={drill.href} className="sw-print-hide inline-flex min-h-9 items-center gap-1 text-label font-semibold text-accent-text underline-offset-4 hover:underline">
              {drill.label ?? "See members"}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          ) : null}
        </span>
      </figcaption>
      <div className="min-w-0">{children}</div>
      {table && table.rows.length ? (
        <details className="group sw-print-hide">
          <summary className="inline-flex min-h-9 cursor-pointer select-none items-center text-label text-ink-secondary underline-offset-4 hover:text-ink hover:underline">
            <span className="group-open:hidden">Show as table</span>
            <span className="hidden group-open:inline">Hide table</span>
          </summary>
          <DataTable table={table} className="mt-2" />
        </details>
      ) : null}
    </figure>
  );
}

/**
 * Cohort retention grid: rows are join months, columns are months since joining, each cell the share of
 * the cohort still active. One-hue ordinal ramp with the value printed in every cell, its ink picked by
 * the fill's luminance, so the colour is a second reading, not the only one.
 */
export function HeatTable({ rows, columns, label }: { rows: Array<{ key: string; label: string; size: number; cells: Array<number | null> }>; columns: string[]; label: string }) {
  const step = (value: number) => Math.min(5, Math.max(1, Math.ceil(value * 5)));
  return (
    <div className="w-full overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-caption" aria-label={label}>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 bg-panel px-2 py-1 text-left font-semibold text-ink-secondary">Joined</th>
            <th scope="col" className="px-2 py-1 text-right font-semibold text-ink-secondary">People</th>
            {columns.map((column) => <th key={column} scope="col" className="min-w-11 px-1 py-1 text-center font-semibold text-ink-muted">{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row" className="sticky left-0 whitespace-nowrap bg-panel px-2 py-1 text-left font-normal text-ink">{row.label}</th>
              <td className="px-2 py-1 text-right tabular-nums text-ink-secondary">{row.size}</td>
              {row.cells.map((cell, index) =>
                cell === null || row.size === 0 ? (
                  <td key={index} className="rounded-[4px] bg-transparent px-1 py-1 text-center text-ink-disabled">·</td>
                ) : (
                  <td key={index} className="rounded-[4px] px-1 py-1 text-center font-semibold tabular-nums" style={{ background: `var(--chart-ord-${step(cell)})`, color: `var(--chart-ord-on-${step(cell)})` }}>
                    {Math.round(cell * 100)}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
