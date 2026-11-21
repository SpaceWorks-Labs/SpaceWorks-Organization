import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { Comparison } from "@/lib/reports/platformRange";
import { formatAmount } from "@/lib/reports/money";
import { cn } from "@/lib/cn";

/** What a compared figure measures: a count, a rate (0 to 1, compared in points) or minor units of one currency. */
export type FigureKind = "count" | "rate" | `money:${string}`;

const moneyCode = (kind: FigureKind) => (kind.startsWith("money:") ? kind.slice(6) : null);

/** The figure itself: "1,284", "72%" or "₹1,200.00". */
export function figure(value: number | null, kind: FigureKind): string {
  if (value === null || !Number.isFinite(value)) return "No data";
  if (kind === "rate") return `${Math.round(value * 1000) / 10}%`;
  const code = moneyCode(kind);
  return code ? formatAmount(Math.round(value), code) : Math.round(value).toLocaleString("en-IN");
}

function deltaText(delta: number, kind: FigureKind): { text: string; zero: boolean } {
  const code = moneyCode(kind);
  const sign = (value: number) => (value > 0 ? "+" : "−");
  if (kind === "rate") {
    const points = Math.round(delta * 1000) / 10;
    return { text: points === 0 ? "0 pts" : `${sign(points)}${Math.abs(points)} pts`, zero: points === 0 };
  }
  const rounded = Math.round(delta);
  if (rounded === 0) return { text: code ? formatAmount(0, code) : "0", zero: true };
  return { text: `${sign(rounded)}${code ? formatAmount(Math.abs(rounded), code) : Math.abs(rounded).toLocaleString("en-IN")}`, zero: false };
}

/**
 * The change against the previous period: an arrow, the signed change (rates in points, counts with the
 * percentage change too) and a word for screen readers saying whether that is better or worse. Green means
 * better and red worse, so for lapses, churn and refunds a rise is red; the arrow and sign carry it without colour.
 */
export function DeltaChip({ comparison, kind, higherIsBetter = true, vs }: { comparison: Comparison; kind: FigureKind; higherIsBetter?: boolean; vs: string }) {
  if (comparison.current === null) return null;
  if (comparison.delta === null) return <span className="text-caption text-ink-muted">Nothing to compare {vs.replace(/^vs /, "with ")}</span>;
  const { text, zero } = deltaText(comparison.delta, kind);
  const up = comparison.delta > 0;
  const good = zero ? null : up === higherIsBetter;
  const Icon = zero ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const pct = kind !== "rate" && comparison.pct !== null && !zero ? ` (${comparison.pct > 0 ? "+" : "−"}${Math.abs(Math.round(comparison.pct * 100))}%)` : "";
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1 text-caption", good === null ? "text-ink-muted" : good ? "text-success-solid" : "text-danger-fg")}>
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span className="font-semibold tabular-nums">{text}{pct}</span>
      <span className="text-ink-muted">{vs}</span>
      {good === null ? null : <span className="sr-only">{good ? ", better" : ", worse"}</span>}
    </span>
  );
}

/** A stat tile (same anatomy as the reports' KpiTile) whose figure is set against the previous period. */
export function ComparedTile({ label, comparison, kind = "count", higherIsBetter = true, vs, hint, value }: { label: string; comparison?: Comparison; kind?: FigureKind; higherIsBetter?: boolean; vs?: string; hint?: ReactNode; value?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-line bg-panel p-4">
      <span className="text-label text-ink-secondary">{label}</span>
      <span className="whitespace-nowrap text-[28px] font-semibold leading-tight tracking-[-0.01em] tabular-nums text-ink">{value ?? figure(comparison?.current ?? null, kind)}</span>
      {comparison && vs ? <DeltaChip comparison={comparison} kind={kind} higherIsBetter={higherIsBetter} vs={vs} /> : null}
      {hint ? <span className="text-caption text-ink-muted">{hint}</span> : null}
    </div>
  );
}

export const tileGrid = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3";

/** Label and value pairs in a wrapping row: the summary under a section heading, and the figures beside a chart. */
export function StatList({ items, label }: { items: Array<{ label: string; value: ReactNode; hint?: string }>; label: string }) {
  return (
    <dl aria-label={label} className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,9.5rem),1fr))] gap-x-5 gap-y-3">
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col">
          <dt className="text-label text-ink-secondary">{item.label}</dt>
          <dd className="text-[20px] font-semibold leading-tight tabular-nums text-ink">{item.value}</dd>
          {item.hint ? <dd className="text-caption text-ink-muted">{item.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/**
 * A segmented row of links (the look of the kit's segmented control) for choices that live in the address:
 * range, status, currency, page size. The current one is marked with aria-current, not colour alone.
 */
export function LinkChoices({ label, options, className }: { label: string; options: Array<{ href: string; label: string; current: boolean; title?: string }>; className?: string }) {
  return (
    <nav aria-label={label} className={cn("inline-flex max-w-full self-start flex-wrap gap-1 rounded-lg border border-line bg-surface p-1", className)}>
      {options.map((option) => (
        <Link
          key={option.href}
          href={option.href}
          scroll={false}
          title={option.title}
          aria-current={option.current ? "true" : undefined}
          className={cn(
            "inline-flex min-h-9 items-center justify-center rounded-md px-3 text-sm font-semibold transition-[background-color,color,box-shadow] duration-(--sw-dur-fast) ease-sw",
            option.current ? "bg-panel text-ink shadow-segment" : "text-ink-muted hover:text-ink",
          )}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}

/** A labelled control in a filter row. */
export function Control({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span aria-hidden className="text-label text-ink-secondary">{label}</span>
      {children}
    </div>
  );
}

/** One section of a page: a heading, a one-line reading and its content. */
export function Section({ id, title, description, action, children }: { id: string; title: string; description?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={id} className="text-title text-ink">{title}</h2>
          {description ? <p className="text-label text-ink-muted">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A quiet empty state inside a chart frame or section. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-body-ui text-ink-muted">{children}</p>;
}
