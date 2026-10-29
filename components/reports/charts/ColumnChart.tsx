"use client";

import { useCallback } from "react";
import { formatTick, formatValue, labelStride, niceTicks, type ValueFormat } from "@/lib/reports/chartScale";
import { ChartLegend, ChartTooltip } from "./ChartTooltip";
import { slotColor, useIndexFocus, useWidth } from "./useChartPointer";

type ColumnSeries = { key: string; label: string; slot: number | "muted"; values: number[] };

type ColumnChartProps = {
  labels: string[];
  /** One to three series, drawn side by side in each slot. */
  series: ColumnSeries[];
  ariaLabel: string;
  format?: ValueFormat;
  height?: number;
};

const AXIS_BAND = 24;
const TOP = 16;
const MAX_BAR = 24;
const GAP = 2;

/** Rounded 4px data end, square at the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`;
}

/**
 * Columns over time or categories (dataviz: ≤24px bars, 4px rounded tops anchored to one baseline, 2px
 * surface gap between neighbours, value on the tallest cap only). Each slot is a hit target wider than
 * its bars; hover or arrow keys show every series in that slot.
 */
export function ColumnChart({ labels, series, ariaLabel, format = "number", height = 170 }: ColumnChartProps) {
  const { ref, width, svgWidth } = useWidth<HTMLDivElement>();
  const max = Math.max(1, ...series.flatMap((entry) => entry.values));
  const ticks = niceTicks(max, 4);
  const top = ticks.at(-1)!;
  const left = 36;
  const plotWidth = Math.max(40, width - left - 8);
  const slot = plotWidth / Math.max(1, labels.length);
  const bar = Math.max(2, Math.min(MAX_BAR, (slot * 0.7 - GAP * (series.length - 1)) / series.length));
  const group = bar * series.length + GAP * (series.length - 1);
  const xOf = useCallback((index: number) => left + slot * index + slot / 2, [left, slot]);
  const yOf = (value: number) => TOP + height - (value / top) * height;
  const focus = useIndexFocus(labels.length, xOf);
  const stride = labelStride(labels.length, plotWidth, 56);
  let peak = { s: -1, i: -1, v: -1 };
  series.forEach((entry, s) => entry.values.forEach((value, i) => { if (value > peak.v) peak = { s, i, v: value }; }));

  return (
    <div className="flex flex-col gap-3">
      <ChartLegend items={series.map((entry) => ({ label: entry.label, slot: entry.slot, shape: "rect" }))} />
      <div ref={ref} className="relative rounded-md" tabIndex={0} role="group" aria-label={`${ariaLabel}. Use the arrow keys to read each column.`} onKeyDown={focus.onKeyDown} onBlur={focus.onBlur}>
        <svg width={svgWidth} height={TOP + height + AXIS_BAND} viewBox={`0 0 ${width} ${TOP + height + AXIS_BAND}`} role="img" aria-label={ariaLabel} className="block touch-pan-y select-none" onPointerMove={focus.onPointerMove} onPointerLeave={focus.onPointerLeave}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={left} x2={left + plotWidth} y1={yOf(tick)} y2={yOf(tick)} stroke={tick === 0 ? "var(--chart-axis)" : "var(--chart-grid)"} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={left - 8} y={yOf(tick)} dy="0.32em" textAnchor="end" className="fill-ink-muted text-[12px] tabular-nums">{formatTick(tick, format)}</text>
            </g>
          ))}
          {focus.index !== null ? <rect x={left + slot * focus.index} y={TOP} width={slot} height={height} fill="var(--chart-grid)" opacity={0.6} /> : null}
          {labels.map((label, index) => (
            <g key={`${label}-${index}`}>
              {series.map((entry, s) => {
                const value = entry.values[index] ?? 0;
                const x = xOf(index) - group / 2 + s * (bar + GAP);
                return <path key={entry.key} data-series={entry.key} d={barPath(x, yOf(value), bar, yOf(0) - yOf(value))} fill={slotColor(entry.slot)} />;
              })}
              {index % stride === 0 ? <text x={xOf(index)} y={TOP + height + 16} textAnchor="middle" className="fill-ink-muted text-[12px]">{label}</text> : null}
            </g>
          ))}
          {peak.v > 0 ? (
            <text x={xOf(peak.i) - group / 2 + peak.s * (bar + GAP) + bar / 2} y={yOf(peak.v) - 5} textAnchor="middle" className="fill-ink-secondary text-[12px] font-semibold tabular-nums">{formatValue(peak.v, format)}</text>
          ) : null}
        </svg>
        {focus.index !== null ? (
          <ChartTooltip title={labels[focus.index]} x={xOf(focus.index)} width={width} rows={series.map((entry) => ({ label: entry.label, value: formatValue(entry.values[focus.index!] ?? 0, format), slot: entry.slot, shape: "rect" }))} />
        ) : null}
      </div>
    </div>
  );
}
