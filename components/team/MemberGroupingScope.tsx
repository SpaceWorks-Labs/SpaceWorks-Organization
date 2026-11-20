"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { setTeamMemberGroupings } from "@/app/actions/team";
import { useToast } from "@/components/feedback/ToastProvider";
import { Dropdown } from "@/components/ui/field";
import type { TeamGroupingOption, TeamMemberRow } from "@/components/team/memberSummary";

/**
 * Grouping limits for a staff member: the values they are limited to (each covers those under it), and a select to
 * add another. Several values of one grouping widen it; different groupings narrow it. Only values inside the
 * viewer's own reach are offered; the server checks again.
 */
export function MemberGroupingScope({ organisationSlug, row, groupings }: { organisationSlug: string; row: TeamMemberRow; groupings: TeamGroupingOption[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const held = new Set(row.limits.map((limit) => limit.valueId));
  const save = (valueIds: string[]) => startTransition(async () => {
    const result = await setTeamMemberGroupings({ organisationSlug, targetUserId: row.userId, valueIds });
    if (!result.ok) return showToast(result.error, "error");
    showToast(valueIds.length ? "Grouping limits saved" : "Grouping limits removed", "success");
    router.refresh();
  });
  const offered = groupings.map((grouping) => ({ ...grouping, values: grouping.values.filter((value) => !held.has(value.id)) })).filter((grouping) => grouping.values.length > 0);
  if (!row.limits.length && !offered.length) return null;
  const name = row.name ?? row.email ?? "this person";
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {row.limits.map((limit) => (
        <span key={limit.valueId} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface py-1 pl-2.5 pr-1 text-caption text-ink">
          {limit.groupingName}: {limit.label}
          <button type="button" aria-label={`Remove the ${limit.groupingName}: ${limit.label} limit for ${name}`} disabled={pending} className="relative inline-flex size-7 items-center justify-center rounded-full text-ink-secondary after:absolute after:-inset-2 hover:bg-muted hover:text-ink disabled:text-ink-muted" onClick={() => save(row.limits.filter((entry) => entry.valueId !== limit.valueId).map((entry) => entry.valueId))}>
            <X aria-hidden className="size-3.5" />
          </button>
        </span>
      ))}
      {offered.length ? (
        <Dropdown aria-label={`Limit ${name} to a grouping value`} value="" disabled={pending} className="w-auto min-w-[160px] max-w-[220px] py-2 text-sm" onChange={(event) => event.target.value && save([...held, event.target.value])}>
          <option value="">Limit to a grouping…</option>
          {offered.map((grouping) => <optgroup key={grouping.id} label={grouping.name}>{grouping.values.map((value) => <option key={value.id} value={value.id}>{value.label}</option>)}</optgroup>)}
        </Dropdown>
      ) : null}
    </div>
  );
}
