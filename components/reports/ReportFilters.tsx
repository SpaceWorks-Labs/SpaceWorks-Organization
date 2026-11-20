"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Dropdown, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

type Option = { id: string; name: string; level?: number };

const PERIODS = [
  { value: "fy", label: "This financial year" },
  { value: "last-fy", label: "Last financial year" },
  { value: "12m", label: "Last 12 months" },
  { value: "90d", label: "Last 90 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Custom dates" },
];

/**
 * The one filter row above every report: period first, then plan and unit. Every choice lives in the
 * address, so a filtered report can be bookmarked or shared, and the tabs carry it along. While the next
 * view loads, the page keeps the current one and the row says "Updating…" (text stays opaque, CR-OPACITY-01).
 */
export function ReportFilters({ plans, units, initial, unitLabel }: { plans: Option[]; units: Option[]; initial: { period: string; from: string; to: string; plan: string; unit: string }; unitLabel: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [period, setPeriod] = useState(initial.period);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const go = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params?.toString() ?? "");
    for (const [key, value] of Object.entries(patch)) {
      if (value && !(key === "period" && value === "fy")) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    if (next.get("period") !== "custom") {
      next.delete("from");
      next.delete("to");
    }
    start(() => router.push(`?${next.toString()}`, { scroll: false }));
  };
  return (
    <div className="sw-print-hide flex flex-col gap-3 rounded-xl border border-line bg-surface p-3 sm:flex-row sm:flex-wrap sm:items-end" data-pending={pending || undefined} aria-busy={pending}>
      <label className="flex min-w-0 flex-col gap-1 sm:w-56">
        <span className="text-label text-ink-secondary">Period</span>
        <Dropdown
          value={period}
          onChange={(event) => {
            setPeriod(event.target.value);
            if (event.target.value !== "custom") go({ period: event.target.value });
          }}
        >
          {PERIODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Dropdown>
      </label>
      {period === "custom" ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            go({ period: "custom", from, to });
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-label text-ink-secondary">From</span>
            <Input type="date" required value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} className="w-40" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-label text-ink-secondary">To</span>
            <Input type="date" required value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} className="w-40" />
          </label>
          <Button type="submit" variant="secondary">Apply dates</Button>
        </form>
      ) : null}
      {plans.length > 1 ? (
        <label className="flex min-w-0 flex-col gap-1 sm:w-56">
          <span className="text-label text-ink-secondary">Plan</span>
          <Dropdown value={initial.plan} onChange={(event) => go({ plan: event.target.value })}>
            <option value="">All plans</option>
            {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
          </Dropdown>
        </label>
      ) : null}
      {units.length ? (
        <label className="flex min-w-0 flex-col gap-1 sm:w-64">
          <span className="text-label text-ink-secondary">{unitLabel}</span>
          <Dropdown value={initial.unit} onChange={(event) => go({ unit: event.target.value })}>
            <option value="">{`All ${unitLabel.toLowerCase()}s`}</option>
            {units.map((unit) => <option key={unit.id} value={unit.id}>{`${"— ".repeat(unit.level ?? 0)}${unit.name}`}</option>)}
          </Dropdown>
        </label>
      ) : null}
      {pending ? <span role="status" className="text-caption text-ink-muted sm:ml-auto sm:self-center">Updating…</span> : null}
    </div>
  );
}
