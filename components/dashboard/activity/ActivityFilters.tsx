"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Dropdown, Field, Input } from "@/components/ui/field";

type Option = { id: string; label: string };

/** Narrow the activity log. Every choice lives in the address, so a filtered view can be shared. */
export function ActivityFilters({ actors, categories, initial }: { actors: Option[]; categories: Array<{ key: string; label: string }>; initial: { actor: string; category: string; from: string; to: string } }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const go = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params?.toString() ?? "");
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    // A new filter starts from the newest events again.
    next.delete("cursor");
    startTransition(() => router.replace(`?${next.toString()}`, { scroll: false }));
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Who">
          <Dropdown value={initial.actor} onChange={(event) => go({ actor: event.target.value })}>
            <option value="">Anyone</option>
            {actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.label}</option>)}
          </Dropdown>
        </Field>
        <Field label="What">
          <Dropdown value={initial.category} onChange={(event) => go({ category: event.target.value })}>
            <option value="">Everything</option>
            {categories.map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}
          </Dropdown>
        </Field>
        <Field label="From">
          <Input type="date" value={initial.from} max={initial.to || undefined} onChange={(event) => go({ from: event.target.value })} />
        </Field>
        <Field label="To">
          <Input type="date" value={initial.to} min={initial.from || undefined} onChange={(event) => go({ to: event.target.value })} />
        </Field>
      </div>
      <p role="status" className="min-h-5 text-caption text-ink-muted">{pending ? "Updating…" : ""}</p>
    </div>
  );
}
