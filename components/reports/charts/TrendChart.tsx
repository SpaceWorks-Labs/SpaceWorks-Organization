"use client";

import { useCallback } from "react";
import { formatTick, formatValue, labelStride, niceTicks, type ValueFormat } from "@/lib/reports/chartScale";
import { ChartLegend, ChartTooltip } from "./ChartTooltip";
import { slotColor, useIndexFocus, useWidth } from "./useChartPointer";

type TrendSeries = { key: string; label: string; slot: number | "muted"; values: Array<number | null> };

type TrendChartProps = {
  /** One label per x position, oldest first. */
  labels: string[];
  series: TrendSeries[];
  /** Short description for screen readers; the table view next to the chart carries the values. */
  ariaLabel: string;
  format?: ValueFormat;
  /** Soft 10% wash under a single series. */
  area?: boolean;
  /** Plot height in px, x-axis band excluded (the component adds it). */
  height?: number;
  /** Fix the top of the y-axis (1 for percentages). */
  yMax?: number;
};

const AXIS_BAND = 24;
const TOP = 10;

/**
 * Line or area trend over time (dataviz: 2px lines, round joins, ≥8px end markers with a 2px surface
 * ring, hairline solid grid, one y-axis). Crosshair and one tooltip for every series at the hovered x;
 * keyboard: focus the chart, then arrow keys. ≤4 series are direct-labelled at their end.
 */
export function TrendChart({ labels, series, ariaLabel, format = "number", area = false, height = 180, yMax }: TrendChartProps) {
  const { ref, width, svgWidth } = useWidth<HTMLDivElement>();
  const values = series.flatMap((entry) => entry.values.filter((value): value is number => value !== null));
  const ticks = niceTicks(yMax ?? Math.max(1, ...values), 4);
  const top = ticks.at(-1)!;
  const left = format === "percent" ? 40 : 36;
  const directLabels = series.length <= 4;
  const right = directLabels ? 44 : 12;
  const plotWidth = Math.max(40, width - left - right);
  const xOf = useCallback((index: number) => left + (labels.length <= 1 ? plotWidth / 2 : (index / (labels.length - 1)) * plotWidth), [labels.length, left, plotWidth]);
  const yOf = (value: number) => TOP + height - (value / top) * height;
  const focus = useIndexFocus(labels.length, xOf);
  const stride = labelStride(labels.length, plotWidth);

  const path = (points: Array<number | null>) => {
    let d = "";
    let pen = false;
    points.forEach((value, index) => {
      if (value === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${xOf(index).toFixed(1)} ${yOf(value).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const lastIndex = (points: Array<number | null>) => {
    for (let i = points.length - 1; i >= 0; i -= 1) if (points[i] !== null) return i;
    return -1;
  };

  return (
    <div className="flex flex-col gap-3">
      <ChartLegend items={series.map((entry) => ({ label: entry.label, slot: entry.slot, shape: "line" }))} />
      <div ref={ref} className="relative rounded-md" tabIndex={0} role="group" aria-label={`${ariaLabel}. Use the arrow keys to read each point.`} onKeyDown={focus.onKeyDown} onBlur={focus.onBlur}>
        <svg width={svgWidth} height={TOP + height + AXIS_BAND} viewBox={`0 0 ${width} ${TOP + height + AXIS_BAND}`} role="img" aria-label={ariaLabel} className="block touch-pan-y select-none" onPointerMove={focus.onPointerMove} onPointerLeave={focus.onPointerLeave}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={left} x2={left + plotWidth} y1={yOf(tick)} y2={yOf(tick)} stroke={tick === 0 ? "var(--chart-axis)" : "var(--chart-grid)"} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={left - 8} y={yOf(tick)} dy="0.32em" textAnchor="end" className="fill-ink-muted text-[12px] tabular-nums">{formatTick(tick, format)}</text>
            </g>
          ))}
          {labels.map((label, index) => (index % stride === 0 || index === labels.length - 1) && (index === labels.length - 1 || labels.length - 1 - index >= stride / 2) ? (
            <text key={`${label}-${index}`} x={xOf(index)} y={TOP + height + 16} textAnchor={index === 0 && labels.length > 1 ? "start" : index === labels.length - 1 && labels.length > 1 ? "end" : "middle"} className="fill-ink-muted text-[12px]">{label}</text>
          ) : null)}
          {area && series.length === 1 ? (
            <path d={`${path(series[0].values)}L${xOf(lastIndex(series[0].values)).toFixed(1)} ${yOf(0)}L${xOf(series[0].values.findIndex((v) => v !== null)).toFixed(1)} ${yOf(0)}Z`} fill={slotColor(series[0].slot)} opacity={0.1} />
          ) : null}
          {series.map((entry) => (
            <path key={entry.key} data-series={entry.key} d={path(entry.values)} fill="none" stroke={slotColor(entry.slot)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {series.map((entry) => {
            const end = lastIndex(entry.values);
            if (end < 0) return null;
            const value = entry.values[end]!;
            return (
              <g key={`${entry.key}-end`}>
                <circle cx={xOf(end)} cy={yOf(value)} r={4} fill={slotColor(entry.slot)} stroke="var(--chart-surface)" strokeWidth={2} />
                {directLabels ? <text x={xOf(end) + 8} y={yOf(value)} dy="0.32em" className="fill-ink-secondary text-[12px] font-semibold tabular-nums">{formatValue(value, format)}</text> : null}
              </g>
            );
          })}
          {focus.index !== null ? (
            <g pointerEvents="none">
              <line x1={xOf(focus.index)} x2={xOf(focus.index)} y1={TOP} y2={TOP + height} stroke="var(--chart-axis)" strokeWidth={1} />
              {series.map((entry) => {
                const value = entry.values[focus.index!];
                return value === null || value === undefined ? null : <circle key={entry.key} cx={xOf(focus.index!)} cy={yOf(value)} r={4} fill={slotColor(entry.slot)} stroke="var(--chart-surface)" strokeWidth={2} />;
              })}
            </g>
          ) : null}
        </svg>
        {focus.index !== null ? (
          <ChartTooltip title={labels[focus.index]} x={xOf(focus.index)} width={width} rows={series.map((entry) => ({ label: entry.label, value: formatValue(entry.values[focus.index!], format), slot: entry.slot }))} />
        ) : null}
      </div>
    </div>
  );
}
