/**
 * Axis maths and number formats for the report charts. Pure and client-safe.
 */
import { currencyExponent, isCurrencyCode } from "@/lib/money/currencies";
import { formatAmount } from "./money";

/** Round, human tick values from 0 to at least `max` (0 / 5 / 10…, 0 / 1K / 2K…). */
export function niceTicks(max: number, count = 4, options: { integer?: boolean } = {}): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  // Counts never get fractional ticks, which would round to repeated labels (0, 0, 1, 1, 1).
  if (options.integer && max <= count) return Array.from({ length: Math.max(1, Math.ceil(max)) + 1 }, (_, index) => index);
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= raw) ?? 10 * magnitude;
  const whole = step < 1 && max <= 1 ? step : Math.max(1, step);
  const ticks: number[] = [];
  for (let value = 0; value < max + whole * 0.999; value += whole) ticks.push(Number(value.toFixed(6)));
  return ticks.length > 1 ? ticks : [0, whole];
}

/** 1,284 · 12.9K · 4.2M, en-IN digits. */
export function compactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1000) return Math.round(value).toLocaleString("en-IN");
  if (abs < 1_000_000) return `${(value / 1000).toFixed(abs < 10_000 ? 1 : 0).replace(/\.0$/, "")}K`;
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/** "money:INR" plots minor units of one currency; charts never mix currencies. */
export type ValueFormat = "number" | "percent" | `money:${string}`;

function moneyCode(format: ValueFormat): string | null {
  return format.startsWith("money:") ? format.slice(6) : null;
}

/** A ratio (0–1) as "72%", a count as "1,284", money as "₹1,200.00". Null is "—". */
export function formatValue(value: number | null | undefined, format: ValueFormat = "number"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (format === "percent") return `${Math.round(value * 100)}%`;
  const code = moneyCode(format);
  if (code) return formatAmount(Math.round(value), code);
  return Math.round(value).toLocaleString("en-IN");
}

export function formatTick(value: number, format: ValueFormat = "number"): string {
  if (format === "percent") return `${Math.round(value * 100)}%`;
  const code = moneyCode(format);
  if (code) return compactNumber(value / 10 ** (isCurrencyCode(code) ? currencyExponent(code) : 2));
  return compactNumber(value);
}

/** Show every nth x label so labels never collide: about one per 64px. */
export function labelStride(count: number, width: number, minGap = 64): number {
  if (count <= 1) return 1;
  return Math.max(1, Math.ceil((count * minGap) / Math.max(1, width)));
}

/** "2 days", "5 hours", "under an hour". */
export function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return "under an hour";
  if (hours < 48) return `${Math.round(hours)} ${Math.round(hours) === 1 ? "hour" : "hours"}`;
  const days = Math.round(hours / 24);
  return `${days} days`;
}

/** Signed change for a delta chip: "+12", "−3", "0". Uses a true minus sign. */
export function signed(value: number, format: ValueFormat = "number"): string {
  const text = format === "percent" ? `${Math.abs(Math.round(value * 100))} pts` : Math.abs(Math.round(value)).toLocaleString("en-IN");
  if (Math.round(format === "percent" ? value * 100 : value) === 0) return format === "percent" ? "0 pts" : "0";
  return `${value > 0 ? "+" : "−"}${text}`;
}
