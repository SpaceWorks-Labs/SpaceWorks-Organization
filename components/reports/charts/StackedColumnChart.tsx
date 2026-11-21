"use client";

import { useCallback } from "react";
import { formatTick, formatValue, labelStride, niceTicks, type ValueFormat } from "@/lib/reports/chartScale";
import { ChartLegend, ChartTooltip } from "./ChartTooltip";
import { slotColor, useIndexFocus, useWidth } from "./useChartPointer";

type StackSeries = { key: string; label: string; slot: number | "muted"; values: number[] };

type StackedColumnChartProps = {
  labels: string[];
  /**
   * Columns drawn side by side in each slot; each column stacks its series from the baseline up, in order
   * (e.g. [[online, inHand], [refunds]]). Five series at most across all columns (slots 1–5; never danger).
   */
  columns: StackSeries[][];
  ariaLabel: string;
  format?: ValueFormat;
  height?: number;
};

const AXIS_BAND = 24;
const TOP = 16;
const MAX_BAR = 24;
const GAP = 2;

/** Rounded 4px data end on the top segment only, square elsewhere. */
function segmentPath(x: number, y: number, w: number, h: number, rounded: boolean) {
  if (h <= 0) return "";
  if (!rounded) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
  const r = Math.min(4, w / 2, h);
  return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`;
}

/**
 * Stacked columns over time (dataviz: ≤24px columns on one baseline, a 2px surface gap between stacked
 * segments and between neighbouring columns, a rounded data end on the top segment, the total of the
 * tallest stack as the one direct label). Hover or arrow keys read every series in a slot.
 */
export function StackedColumnChart({ labels, columns, ariaLabel, format = "number", height = 170 }: StackedColumnChartProps) {
  const { ref, width, svgWidth } = useWidth<HTMLDivElement>();
  const series = columns.flat();
  const totalOf = (column: StackSeries[], index: number) => column.reduce((sum, entry) => sum + Math.max(0, entry.values[index] ?? 0), 0);
  const max = Math.max(1, ...columns.flatMap((column) => labels.map((_, index) => totalOf(column, index))));
  // Counts never get fractional ticks (niceTicks steps by 0.25 below 1, which would print 0, 0, 1, 1, 1).
  const ticks = niceTicks(format === "number" ? Math.max(max, 4) : max, 4);
  const top = ticks.at(-1)!;
  const left = 40;
  const plotWidth = Math.max(40, width - left - 8);
  const slot = plotWidth / Math.max(1, labels.length);
  const bar = Math.max(2, Math.min(MAX_BAR, (slot * 0.7 - GAP * (columns.length - 1)) / columns.length));
  const group = bar * columns.length + GAP * (columns.length - 1);
  const xOf = useCallback((index: number) => left + slot * index + slot / 2, [left, slot]);
  const scale = (value: number) => (value / top) * height;
  const baseline = TOP + height;
  const focus = useIndexFocus(labels.length, xOf);
  const stride = labelStride(labels.length, plotWidth, 56);
  let peak = { c: -1, i: -1, v: -1 };
  columns.forEach((column, c) => labels.forEach((_, i) => { const v = totalOf(column, i); if (v > peak.v) peak = { c, i, v }; }));

  return (
    <div className="flex flex-col gap-3">
      <ChartLegend items={series.map((entry) => ({ label: entry.label, slot: entry.slot, shape: "rect" }))} />
      <div ref={ref} className="relative rounded-md" tabIndex={0} role="group" aria-label={`${ariaLabel}. Use the arrow keys to read each column.`} onKeyDown={focus.onKeyDown} onBlur={focus.onBlur}>
        <svg width={svgWidth} height={TOP + height + AXIS_BAND} viewBox={`0 0 ${width} ${TOP + height + AXIS_BAND}`} role="img" aria-label={ariaLabel} className="block touch-pan-y select-none" onPointerMove={focus.onPointerMove} onPointerLeave={focus.onPointerLeave}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={left} x2={left + plotWidth} y1={baseline - scale(tick)} y2={baseline - scale(tick)} stroke={tick === 0 ? "var(--chart-axis)" : "var(--chart-grid)"} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={left - 8} y={baseline - scale(tick)} dy="0.32em" textAnchor="end" className="fill-ink-muted text-[12px] tabular-nums">{formatTick(tick, format)}</text>
            </g>
          ))}
          {focus.index !== null ? <rect x={left + slot * focus.index} y={TOP} width={slot} height={height} fill="var(--chart-hover)" /> : null}
          {labels.map((label, index) => (
            <g key={`${label}-${index}`}>
              {columns.map((column, c) => {
                const x = xOf(index) - group / 2 + c * (bar + GAP);
                const filled = column.filter((entry) => (entry.values[index] ?? 0) > 0);
                let y = baseline;
                return filled.map((entry, s) => {
                  const h = Math.max(1, scale(entry.values[index]) - (s > 0 ? GAP : 0));
                  y -= h + (s > 0 ? GAP : 0);
                  return <path key={entry.key} data-series={entry.key} d={segmentPath(x, y, bar, h, s === filled.length - 1)} fill={slotColor(entry.slot)} stroke="var(--chart-edge)" strokeWidth={1} />;
                });
              })}
              {index % stride === 0 ? <text x={xOf(index)} y={baseline + 16} textAnchor="middle" className="fill-ink-muted text-[12px]">{label}</text> : null}
            </g>
          ))}
          {peak.v > 0 ? (
            <text x={xOf(peak.i) - group / 2 + peak.c * (bar + GAP) + bar / 2} y={baseline - scale(peak.v) - 5} textAnchor="middle" className="fill-ink-secondary text-[12px] font-semibold tabular-nums">{formatValue(peak.v, format)}</text>
          ) : null}
        </svg>
        {focus.index !== null ? (
          <ChartTooltip
            announce={focus.fromKeyboard}
            title={labels[focus.index]}
            x={xOf(focus.index)}
            width={width}
            rows={series.map((entry) => ({ label: entry.label, value: formatValue(entry.values[focus.index!] ?? 0, format), slot: entry.slot, shape: "rect" as const }))}
          />
        ) : null}
      </div>
    </div>
  );
}
