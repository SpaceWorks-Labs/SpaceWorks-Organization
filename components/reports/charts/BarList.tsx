import Link from "next/link";
import { cn } from "@/lib/cn";

type BarListItem = {
  key: string;
  label: string;
  value: number;
  /** Shown instead of the bare number, e.g. "₹12,400" or "42 · 18%". */
  display?: string;
  /** Drill-down to the members behind this bar. */
  href?: string;
  hint?: string;
};

/**
 * Ranked horizontal bars for one nominal series (plan mix, units, roles, states, sources): every bar
 * takes slot 1, values are direct labels at the tip, and each row links to its members. Plain HTML, so it
 * reads correctly with no script and in a screen reader as a list.
 */
export function BarList({ items, label, max, ordinal = false, empty = "Nothing to show for this period." }: { items: BarListItem[]; label: string; max?: number; ordinal?: boolean; empty?: string }) {
  if (!items.length) return <p className="py-6 text-center text-body-ui text-ink-muted">{empty}</p>;
  const top = Math.max(1, max ?? Math.max(...items.map((item) => item.value)));
  return (
    <ul aria-label={label} className="flex flex-col gap-2.5">
      {items.map((item, index) => {
        const body = (
          <>
            <span className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-label text-ink">{item.label}</span>
              <span className="shrink-0 text-label font-semibold tabular-nums text-ink">{item.display ?? item.value.toLocaleString("en-IN")}</span>
            </span>
            <span aria-hidden className="mt-1 block h-2 w-full rounded-full bg-muted">
              <span
                className="block h-2 rounded-full"
                style={{ width: `${Math.max(item.value > 0 ? 2 : 0, (item.value / top) * 100)}%`, background: ordinal ? `var(--chart-ord-${Math.min(5, index + 1)})` : "var(--chart-1)" }}
              />
            </span>
            {item.hint ? <span className="mt-0.5 block text-caption text-ink-muted">{item.hint}</span> : null}
          </>
        );
        return (
          <li key={item.key}>
            {item.href ? (
              <Link href={item.href} className={cn("block rounded-md px-2 py-1.5 -mx-2 transition-colors duration-[120ms] hover:bg-subtle")} aria-label={`${item.label}: ${item.display ?? item.value}. See these members`}>
                {body}
              </Link>
            ) : (
              <div className="px-0 py-1.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

type Segment = { key: string; label: string; value: number; display?: string; href?: string };

/**
 * One 100% stacked bar for part-to-whole (standing mix, ageing): 2px surface gaps between segments,
 * ordinal or categorical fills, and a legend that carries every value so the colour is never alone.
 */
export function StackedBar({ segments, label, ordinal = false }: { segments: Segment[]; label: string; ordinal?: boolean }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const fill = (index: number) => (ordinal ? `var(--chart-ord-${Math.min(5, index + 1)})` : `var(--chart-${Math.min(6, index + 1)})`);
  return (
    <div className="flex flex-col gap-3">
      <div role="img" aria-label={`${label}: ${segments.map((s) => `${s.label} ${s.display ?? s.value}`).join(", ")}`} className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
        {total > 0
          ? segments.map((segment, index) => (segment.value > 0 ? <span key={segment.key} title={`${segment.label}: ${segment.display ?? segment.value}`} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(segment.value / total) * 100}%`, background: fill(index) }} /> : null))
          : null}
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,10.5rem),1fr))] gap-x-5 gap-y-1.5">
        {segments.map((segment, index) => {
          const content = (
            <>
              <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: fill(index) }} />
              <span className="min-w-0 flex-1 truncate text-label text-ink-secondary">{segment.label}</span>
              <span className="text-label font-semibold tabular-nums text-ink">{segment.display ?? segment.value.toLocaleString("en-IN")}</span>
            </>
          );
          return (
            <li key={segment.key}>
              {segment.href ? <Link href={segment.href} className="flex items-center gap-2 rounded-md py-0.5 hover:underline">{content}</Link> : <span className="flex items-center gap-2 py-0.5">{content}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
