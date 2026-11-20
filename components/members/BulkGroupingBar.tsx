"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setGroupingForMembers } from "@/app/actions/member-groupings";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Dropdown, Field } from "@/components/ui/field";
import type { PickerGroupingView } from "./GroupingPicker";

/** The bar over the members list once members are ticked: give them one grouping value, or clear a grouping. */
export function BulkGroupingBar({ slug, groupings, memberIds, onDone }: { slug: string; groupings: PickerGroupingView[]; memberIds: string[]; onDone: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const usable = groupings.filter((grouping) => grouping.values.length > 0);
  const [groupingId, setGroupingId] = useState(usable[0]?.id ?? "");
  const [valueId, setValueId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [pending, startTransition] = useTransition();
  const grouping = usable.find((entry) => entry.id === groupingId);
  const count = `${memberIds.length} ${memberIds.length === 1 ? "member" : "members"}`;
  const apply = (clear: boolean) => startTransition(async () => {
    setError(null);
    const result = await setGroupingForMembers({ organisationSlug: slug, memberIds, groupingId, valueId: clear ? null : valueId });
    setConfirmClear(false);
    if (!result.ok) return setError(result.error);
    // The bar closes with the selection, so the result is a toast.
    showToast(`${result.data?.done ?? 0} updated${result.data?.skipped ? `, ${result.data.skipped} skipped` : ""}.`, "success");
    router.refresh();
    onDone();
  });
  return (
    <div className="sticky top-2 z-10 flex flex-col gap-3 rounded-xl border border-line bg-panel px-4 py-3 shadow-float">
      <p className="text-label text-ink">{memberIds.length} selected</p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Grouping" className="w-full sm:w-48">
          <Dropdown value={groupingId} onChange={(event) => { setGroupingId(event.target.value); setValueId(""); }}>
            {usable.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </Dropdown>
        </Field>
        <Field label="Value" className="w-full sm:w-56">
          <Dropdown value={valueId} onChange={(event) => setValueId(event.target.value)}>
            <option value="" disabled>Choose a value</option>
            {grouping?.values.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </Dropdown>
        </Field>
        <Button size="sm" variant="primary" loading={pending && !confirmClear} disabled={!valueId || pending} onClick={() => apply(false)}>{grouping?.multiple ? "Add value" : "Set value"}</Button>
        <Button size="sm" variant="dangerOutline" disabled={pending || !grouping || grouping.limited} onClick={() => setConfirmClear(true)}>Clear grouping</Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Clear selection</Button>
      </div>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <ConfirmDialog
        open={confirmClear}
        title={`Clear ${grouping?.name ?? "this grouping"} for ${count}?`}
        message={`Every value they hold in ${grouping?.name ?? "it"} is removed. Their other groupings, plans and payments stay as they are.`}
        confirmLabel="Clear grouping"
        loading={pending}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => apply(true)}
      />
    </div>
  );
}
