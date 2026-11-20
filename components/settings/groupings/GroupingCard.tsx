"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";
import { setOrgGroupingArchived, updateOrgGrouping } from "@/app/actions/groupings";
import { Button, IconButton } from "@/components/ui/button";
import { AddValue } from "./AddValue";
import { CheckboxField } from "@/components/ui/choice";
import { Callout, Card, CardHeader, Chip } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { ValueRow, type ValueRowData } from "./ValueRow";

export type GroupingRow = { id: string; key: string; name: string; kind: "list" | "tree"; multiple: boolean; archived: boolean; values: ValueRowData[] };

/** One grouping: its name and whether several values may be held, then its values with their actions. */
export function GroupingCard({ slug, grouping, disabled }: { slug: string; grouping: GroupingRow; disabled: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(grouping.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (work: () => Promise<{ ok: boolean; error?: string }>) => startTransition(async () => {
    setError(null);
    const result = await work();
    if (!result.ok) return setError(result.error ?? "Couldn't save that.");
    router.refresh();
  });
  const top = grouping.values.filter((value) => value.level === 0);
  return (
    <Card as="section" className="rounded-xl">
      <CardHeader
        title={<span className="inline-flex flex-wrap items-center gap-2">{grouping.name}{grouping.archived ? <Chip>Archived</Chip> : null}<Chip tone="outline">{grouping.kind === "tree" ? "Tree" : "List"}</Chip></span>}
        description={`Key ${grouping.key}. Imports use it as a column name.`}
        action={!disabled ? (
          <IconButton label={grouping.archived ? "Restore grouping" : "Archive grouping"} size="sm" onClick={() => run(() => setOrgGroupingArchived({ organisationSlug: slug, groupingId: grouping.id, archived: !grouping.archived }))}>
            {grouping.archived ? <ArchiveRestore aria-hidden className="size-4" /> : <Archive aria-hidden className="size-4" />}
          </IconButton>
        ) : undefined}
      />
      {error ? <Callout tone="danger" role="alert" className="mb-4">{error}</Callout> : null}
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Name" className="w-full sm:w-64"><Input value={name} disabled={disabled} maxLength={60} onChange={(event) => setName(event.target.value)} /></Field>
          <CheckboxField checked={grouping.multiple} disabled={disabled || pending} label="Several values per member" onCheckedChange={(checked) => run(() => updateOrgGrouping({ organisationSlug: slug, groupingId: grouping.id, name, multiple: checked === true }))} />
          {!disabled && name.trim() !== grouping.name ? <Button type="button" variant="secondary" loading={pending} onClick={() => run(() => updateOrgGrouping({ organisationSlug: slug, groupingId: grouping.id, name, multiple: grouping.multiple }))}>Rename</Button> : null}
        </div>
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
          {grouping.values.length === 0 ? <li className="p-4 text-body-ui text-ink-secondary">No values yet.</li> : null}
          {grouping.values.map((value) => (
            <ValueRow key={value.id} slug={slug} grouping={grouping} value={value} disabled={disabled || grouping.archived} />
          ))}
        </ul>
        {!disabled && !grouping.archived ? <AddValue slug={slug} groupingId={grouping.id} parentId={null} label={grouping.kind === "tree" && top.length ? "New top-level value" : "New value"} /> : null}
      </div>
    </Card>
  );
}
