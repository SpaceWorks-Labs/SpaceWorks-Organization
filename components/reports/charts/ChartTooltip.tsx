"use client";

import { slotColor } from "./useChartPointer";

type TooltipRow = { label: string; value: string; slot: number | "muted"; shape?: "line" | "rect" };

/**
 * The single readout for a hovered or focused x position: the value leads, the series name follows, keyed
 * by a short stroke of the series colour. Text is rendered as text, never as HTML.
 */
export function ChartTooltip({ title, rows, x, width }: { title: string; rows: TooltipRow[]; x: number; width: number }) {
  const left = Math.min(Math.max(8, x + 12), Math.max(8, width - 196));
  return (
    <div role="status" aria-live="polite" className="pointer-events-none absolute top-1 z-10 w-[184px] rounded-lg border border-line bg-panel px-3 py-2 shadow-[var(--sw-ui-shadow-float)]" style={{ left }}>
      <p className="text-caption text-ink-muted">{title}</p>
      <ul className="mt-1 flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2">
            <span aria-hidden className={row.shape === "rect" ? "size-2.5 shrink-0 rounded-[3px]" : "h-0.5 w-3 shrink-0 rounded-full"} style={{ background: slotColor(row.slot) }} />
            <span className="font-semibold tabular-nums text-ink">{row.value}</span>
            <span className="min-w-0 truncate text-caption text-ink-secondary">{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Legend for two or more series. Mirrors the mark: a line key for lines, a square for bars and areas. */
export function ChartLegend({ items }: { items: Array<{ label: string; slot: number | "muted"; shape?: "line" | "rect" }> }) {
  if (items.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-secondary" aria-label="Legend">
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={item.shape === "line" ? "h-0.5 w-3.5 rounded-full" : "size-2.5 rounded-[3px]"} style={{ background: slotColor(item.slot) }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
