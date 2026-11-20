"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Dropdown, Field } from "@/components/ui/field";
import { SearchField } from "@/components/ui/search-field";

type Option = { id: string; name: string; level?: number };
type GroupingOption = { id: string; name: string; values: Array<{ id: string; label: string }> };

/** Search and narrow the directory. Every choice lives in the address, so a filtered view can be shared. */
export function MemberFilters({ plans, units, roles, groupings = [], smartGroups = [], initial }: { plans: Option[]; units: Option[]; roles: Option[]; groupings?: GroupingOption[]; smartGroups?: Option[]; initial: { q: string; plan: string; unit: string; role: string; gv?: string; sg?: string } }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(initial.q);
  const [pending, startTransition] = useTransition();
  const go = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params?.toString() ?? "");
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    // Replace, not push: each filter change would otherwise fill the back button. The list stays where it is.
    startTransition(() => router.replace(`?${next.toString()}`, { scroll: false }));
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <form className="min-w-0 flex-1" role="search" onSubmit={(event) => { event.preventDefault(); go({ q }); }}>
          <Field label="Search members">
            <SearchField
              placeholder="Name, email or number"
              value={q}
              loading={pending}
              loadingLabel="Updating…"
              onChange={(event) => {
                setQ(event.target.value);
                if (!event.target.value && q) go({ q: "" });
              }}
            />
          </Field>
        </form>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:w-[38rem] lg:grid-cols-3">
          <Field label="Plan">
            <Dropdown value={initial.plan} onChange={(event) => go({ plan: event.target.value })}>
              <option value="">All plans</option>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </Dropdown>
          </Field>
          {units.length ? (
            <Field label="Unit">
              <Dropdown value={initial.unit} onChange={(event) => go({ unit: event.target.value })}>
                <option value="">All units</option>
                {units.map((unit) => <option key={unit.id} value={unit.id}>{`${"— ".repeat(unit.level ?? 0)}${unit.name}`}</option>)}
              </Dropdown>
            </Field>
          ) : null}
          {roles.length ? (
            <Field label="Role">
              <Dropdown value={initial.role} onChange={(event) => go({ role: event.target.value })}>
                <option value="">All roles</option>
                {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
              </Dropdown>
            </Field>
          ) : null}
          {groupings.length ? (
            <Field label="Grouping">
              <Dropdown value={initial.gv ?? ""} onChange={(event) => go({ gv: event.target.value })}>
                <option value="">Any grouping</option>
                {groupings.map((grouping) => (
                  <optgroup key={grouping.id} label={grouping.name}>{grouping.values.map((value) => <option key={value.id} value={value.id}>{value.label}</option>)}</optgroup>
                ))}
              </Dropdown>
            </Field>
          ) : null}
          {smartGroups.length ? (
            <Field label="Smart group">
              <Dropdown value={initial.sg ?? ""} onChange={(event) => go({ sg: event.target.value })}>
                <option value="">No smart group</option>
                {smartGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </Dropdown>
            </Field>
          ) : null}
        </div>
      </div>
      <p role="status" className="min-h-5 text-caption text-ink-muted">{pending ? "Updating…" : ""}</p>
    </div>
  );
}
