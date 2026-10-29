import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CircleCheck, Minus, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatValue, signed, type ValueFormat } from "@/lib/reports/chartScale";

/** A 12-point-or-so history line in the de-emphasis grey with the latest point in the accent. Decorative beside a real value. */
function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const w = 96;
  const h = 28;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = Math.max(1, max - min);
  const point = (value: number, index: number) => [2 + (index / (values.length - 1)) * (w - 6), 3 + (1 - (value - min) / span) * (h - 6)] as const;
  const d = values.map((value, index) => `${index ? "L" : "M"}${point(value, index).map((n) => n.toFixed(1)).join(" ")}`).join("");
  const [lx, ly] = point(values.at(-1)!, values.length - 1);
  return (
    <svg aria-hidden width={w} height={h} className={cn("block shrink-0", className)}>
      <path d={d} fill="none" stroke="var(--chart-muted)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={3} fill="var(--chart-1)" stroke="var(--chart-surface)" strokeWidth={1.5} />
    </svg>
  );
}

type Delta = { value: number; format?: ValueFormat; vs: string; goodWhenUp?: boolean };

function DeltaChip({ delta }: { delta: Delta }) {
  const rounded = delta.format === "percent" ? Math.round(delta.value * 100) : Math.round(delta.value);
  const up = rounded > 0;
  const flat = rounded === 0;
  const good = flat ? null : up === (delta.goodWhenUp ?? true);
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1 text-caption", good === null ? "text-ink-muted" : good ? "text-success-solid" : "text-danger-fg")}>
      <Icon aria-hidden className="size-3.5" />
      <span className="font-semibold tabular-nums">{signed(delta.value, delta.format)}</span>
      <span className="text-ink-muted">{delta.vs}</span>
    </span>
  );
}

type KpiTileProps = {
  label: string;
  value: number | null;
  format?: ValueFormat;
  /** Shown instead of the formatted value (money lists, durations). */
  display?: string;
  delta?: Delta;
  trend?: number[];
  hint?: string;
  /** Drill-down to the members behind the number. */
  href?: string;
  className?: string;
};

/**
 * Stat tile (dataviz figure contract): sentence-case label, value in proportional figures, optional
 * signed delta against a named period, optional sparkline. The whole tile drills down when it has a link.
 */
export function KpiTile({ label, value, format = "number", display, delta, trend, hint, href, className }: KpiTileProps) {
  const body = (
    <>
      <span className="block text-label text-ink-secondary">{label}</span>
      <span className="mt-1 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <span className="whitespace-nowrap font-display text-[28px] font-extrabold leading-tight tracking-[-0.01em] text-ink">{display ?? formatValue(value, format)}</span>
        {trend ? <Sparkline values={trend} className="mb-1.5" /> : null}
      </span>
      {delta ? <span className="mt-1 block"><DeltaChip delta={delta} /></span> : null}
      {hint ? <span className="mt-1 block text-caption text-ink-muted">{hint}</span> : null}
    </>
  );
  const classes = cn("block min-w-0 rounded-xl border border-line bg-panel p-4", href && "transition-colors duration-[120ms] hover:border-line-strong hover:bg-subtle", className);
  return href ? (
    <Link href={href} className={classes} aria-label={`${label}: ${display ?? formatValue(value, format)}. See these members`}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

type MeterLevel = "ok" | "warning" | "critical";

/**
 * A value against a limit or target. The unfilled track is a lighter step of the fill; past the warning
 * or critical threshold the fill changes and an icon and word say so, so colour never carries it alone.
 */
export function Meter({ label, value, max, display, warnAt = 0.8, criticalAt = 1, invert = false }: { label: string; value: number; max: number | null; display?: string; warnAt?: number; criticalAt?: number; invert?: boolean }) {
  if (!max) {
    return (
      <div className="flex items-baseline justify-between gap-3 text-label">
        <span className="text-ink-secondary">{label}</span>
        <span className="font-semibold tabular-nums text-ink">{display ?? value.toLocaleString("en-IN")} <span className="font-normal text-ink-muted">· no limit</span></span>
      </div>
    );
  }
  const share = value / max;
  const level: MeterLevel = invert ? (share <= criticalAt ? "critical" : share <= warnAt ? "warning" : "ok") : share >= criticalAt ? "critical" : share >= warnAt ? "warning" : "ok";
  const fill = level === "critical" ? "bg-danger-solid" : level === "warning" ? "bg-warning-solid" : "bg-accent";
  const Icon = level === "critical" ? OctagonAlert : level === "warning" ? AlertTriangle : CircleCheck;
  const word = level === "critical" ? (invert ? "Low" : "At limit") : level === "warning" ? (invert ? "Watch" : "Near limit") : "OK";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-label">
        <span className="min-w-0 truncate text-ink-secondary">{label}</span>
        <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
          <span className="font-semibold text-ink">{display ?? `${value.toLocaleString("en-IN")} of ${max.toLocaleString("en-IN")}`}</span>
          <span className={cn("inline-flex items-center gap-1 text-caption", level === "ok" ? "text-ink-muted" : level === "warning" ? "text-warning-fg" : "text-danger-fg")}>
            <Icon aria-hidden className="size-3.5" />
            {word}
          </span>
        </span>
      </div>
      <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)} className="h-2 w-full overflow-hidden rounded-full bg-accent-soft">
        <div className={cn("h-full rounded-full", fill)} style={{ width: `${Math.min(100, share * 100)}%` }} />
      </div>
    </div>
  );
}
