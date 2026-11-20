"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import { moveGroupingValue, renameGroupingValue, reorderGroupingValue, setGroupingValueArchived } from "@/app/actions/groupings";
import { Button, IconButton } from "@/components/ui/button";
import { Callout, Chip } from "@/components/ui/display";
import { Dropdown, Field, Input } from "@/components/ui/field";
import { AddValue } from "./AddValue";

export type ValueRowData = { id: string; parentId: string | null; label: string; code: string; level: number; archived: boolean; members: number };
type GroupingShape = { id: string; kind: "list" | "tree"; values: ValueRowData[] };

/** One value: its label, code and member count, with rename, reorder, move and archive. */
export function ValueRow({ slug, grouping, value, disabled }: { slug: string; grouping: GroupingShape; value: ValueRowData; disabled: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "edit" | "add" | "move">("idle");
  const [label, setLabel] = useState(value.label);
  const [code, setCode] = useState(value.code);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (work: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) => startTransition(async () => {
    setError(null);
    const result = await work();
    if (!result.ok) return setError(result.error ?? "Couldn't save that.");
    done?.();
    router.refresh();
  });
  // A value can move under any live value outside its own subtree.
  const own = new Set<string>([value.id]);
  for (const entry of grouping.values) if (entry.parentId && own.has(entry.parentId)) own.add(entry.id);
  const targets = grouping.values.filter((entry) => !entry.archived && !own.has(entry.id));
  // Reordering happens among the values that share this one's parent.
  const siblings = grouping.values.filter((entry) => entry.parentId === value.parentId);
  const place = siblings.findIndex((entry) => entry.id === value.id);
  const [announcement, setAnnouncement] = useState("");
  // aria-disabled (not disabled) keeps focus on the button while the move saves and once it reaches an end.
  const reorder = (direction: "up" | "down") => {
    const to = place + (direction === "up" ? -1 : 1);
    if (pending || to < 0 || to >= siblings.length) return;
    run(() => reorderGroupingValue({ organisationSlug: slug, valueId: value.id, direction }), () => setAnnouncement(`${value.label} is now ${to + 1} of ${siblings.length}.`));
  };
  return (
    <li className="flex min-w-0 flex-col gap-3 p-3" style={{ paddingInlineStart: `${0.75 + value.level * 1.5}rem` }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={value.archived ? "text-ink-muted line-through" : "text-ink"}>{value.label}</span>
        <Chip size="sm" tone="outline">{value.code}</Chip>
        {value.members > 0 ? (
          <Link href={`/dashboard/${slug}/members?gv=${value.id}`} className="text-caption text-ink-muted underline-offset-4 hover:text-ink hover:underline">{value.members} {value.members === 1 ? "member" : "members"}</Link>
        ) : <span className="text-caption text-ink-muted">0 members</span>}
        {value.archived ? <Chip size="sm">Archived</Chip> : null}
        {!disabled ? (
          <span className="ml-auto flex flex-wrap gap-1">
            <IconButton label={`Move ${value.label} up`} size="sm" aria-disabled={pending || place <= 0 || undefined} onClick={() => reorder("up")}><ArrowUp aria-hidden className="size-4" /></IconButton>
            <IconButton label={`Move ${value.label} down`} size="sm" aria-disabled={pending || place === siblings.length - 1 || undefined} onClick={() => reorder("down")}><ArrowDown aria-hidden className="size-4" /></IconButton>
            <IconButton label={`Rename ${value.label}`} size="sm" onClick={() => setMode(mode === "edit" ? "idle" : "edit")}><Pencil aria-hidden className="size-4" /></IconButton>
            {grouping.kind === "tree" && !value.archived ? <IconButton label={`Add a value under ${value.label}`} size="sm" onClick={() => setMode(mode === "add" ? "idle" : "add")}><Plus aria-hidden className="size-4" /></IconButton> : null}
            <IconButton label={value.archived ? `Restore ${value.label}` : `Archive ${value.label}`} size="sm" disabled={pending} onClick={() => run(() => setGroupingValueArchived({ organisationSlug: slug, valueId: value.id, archived: !value.archived }))}>
              {value.archived ? <ArchiveRestore aria-hidden className="size-4" /> : <Archive aria-hidden className="size-4" />}
            </IconButton>
          </span>
        ) : null}
      </div>
      <p className="sr-only" aria-live="polite">{announcement}</p>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      {mode === "edit" ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); run(() => renameGroupingValue({ organisationSlug: slug, valueId: value.id, label, code }), () => setMode("idle")); }}>
          <Field label="Name" className="min-w-48 flex-1"><Input value={label} maxLength={80} onChange={(event) => setLabel(event.target.value)} /></Field>
          <Field label="Code" className="w-32"><Input value={code} maxLength={12} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} /></Field>
          <Button type="submit" variant="primary" loading={pending} disabled={!label.trim() || !code}>Save</Button>
          {grouping.kind === "tree" && !value.archived ? <Button type="button" variant="ghost" onClick={() => setMode("move")}>Move</Button> : null}
        </form>
      ) : null}
      {mode === "move" ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Move under" className="min-w-48 flex-1">
            <Dropdown value="" onChange={(event) => run(() => moveGroupingValue({ organisationSlug: slug, valueId: value.id, parentId: event.target.value === "__top" ? null : event.target.value }), () => setMode("idle"))}>
              <option value="" disabled>Choose where</option>
              <option value="__top">The top level</option>
              {targets.map((entry) => <option key={entry.id} value={entry.id}>{`${"— ".repeat(entry.level)}${entry.label}`}</option>)}
            </Dropdown>
          </Field>
          <Button type="button" variant="ghost" onClick={() => setMode("idle")}>Cancel</Button>
        </div>
      ) : null}
      {mode === "add" ? <AddValue slug={slug} groupingId={grouping.id} parentId={value.id} label={`New value under ${value.label}`} onDone={() => setMode("idle")} /> : null}
    </li>
  );
}
