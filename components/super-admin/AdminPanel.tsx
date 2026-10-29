import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/display";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";

/** A titled card used across the super-admin pages. */
export function AdminPanel({ title, description, action, children, className }: { title?: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card as="section" className={cn("min-w-0 rounded-xl", className)}>
      {title ? <CardHeader title={title} description={description} action={action} /> : null}
      {children}
    </Card>
  );
}

/** Compact label/value rows (counts, posture facts). */
export function MetricRows({ rows }: { rows: Array<{ label: ReactNode; value: ReactNode }> }) {
  return (
    <dl className="divide-y divide-line">
      {rows.map((row, index) => (
        <div key={index} className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
          <dt className="min-w-0 text-body-ui text-ink-secondary">{row.label}</dt>
          <dd className="shrink-0 text-right text-body-ui font-semibold tabular-nums text-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Name over a muted secondary line, optionally linked. */
export function NameCell({ href, name, sub, external }: { href?: string; name: ReactNode; sub?: ReactNode; external?: boolean }) {
  return (
    <span className="block min-w-0">
      {href ? (
        external ? (
          <a href={href} className="font-semibold text-ink underline-offset-4 hover:underline">{name}</a>
        ) : (
          <Link href={href} className="font-semibold text-ink underline-offset-4 hover:underline">{name}</Link>
        )
      ) : (
        <span className="font-semibold text-ink">{name}</span>
      )}
      {sub ? <span className="block text-caption text-ink-muted">{sub}</span> : null}
    </span>
  );
}

/** GET search form shared by the list pages; resets to the first page. */
export function AdminSearchForm({ action, label, defaultValue, children, submitLabel = "Search" }: { action: string; label: string; defaultValue: string; children?: ReactNode; submitLabel?: string }) {
  return (
    <form action={action} method="GET" className="flex flex-col gap-2.5 rounded-xl border border-line bg-panel p-4 sm:flex-row sm:items-end">
      <label className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-label text-ink">{label}</span>
        <Input name="q" defaultValue={defaultValue} />
      </label>
      {children}
      <input type="hidden" name="page" value="0" />
      <Button type="submit" variant="primary" startIcon={<Search />}>{submitLabel}</Button>
    </form>
  );
}

/** Prev · Page N · Next links that keep the current query. */
export function AdminPager({ basePath, query, page, extra = "" }: { basePath: string; query: string; page: number; extra?: string }) {
  const href = (target: number) => `${basePath}?q=${encodeURIComponent(query)}${extra}&page=${target}`;
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center gap-2 text-body-ui">
      <Link href={href(Math.max(0, page - 1))} className={buttonClasses({ variant: "secondary", size: "sm" })}>
        <ChevronLeft aria-hidden className="size-4" />
        Prev
      </Link>
      <span className="px-2 text-ink-muted">Page {page + 1}</span>
      <Link href={href(page + 1)} className={buttonClasses({ variant: "secondary", size: "sm" })}>
        Next
        <ChevronRight aria-hidden className="size-4" />
      </Link>
    </nav>
  );
}

/** Inline "View · Public · Dashboard" style link row. */
export function LinkRow({ links }: { links: Array<{ href: string; label: string }> }) {
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
      {links.map((link, index) => (
        <span key={link.href} className="inline-flex items-center gap-1.5">
          {index > 0 ? <span aria-hidden className="text-ink-muted">·</span> : null}
          <Link href={link.href} className="font-semibold text-ink underline underline-offset-4 hover:text-ink-secondary">{link.label}</Link>
        </span>
      ))}
    </span>
  );
}
