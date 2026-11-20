"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { deleteSmartGroup, previewSmartGroupCount, saveSmartGroup } from "@/app/actions/smart-groups";
import { Button, IconButton } from "@/components/ui/button";
import { Callout, Card, CardHeader, Chip, EmptyState } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { fromCondition, isComplete, newGroup, newRule, toCondition, type UiGroup } from "@/lib/groups/builderModel";
import type { Condition } from "@/lib/groups/schema";
import { GroupEditor } from "./GroupEditor";
import type { BuilderOptions } from "./RuleEditor";

type GroupRow = { id: string; name: string; description: string; condition: Condition | null; members: number; usesArchivedValue?: boolean };

function Builder({ slug, options, initial, onClose }: { slug: string; options: BuilderOptions; initial: GroupRow | null; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [tree, setTree] = useState<UiGroup>(() => (initial?.condition ? fromCondition(initial.condition) : newGroup("all", [newRule()])));
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const complete = isComplete(tree);
  const nameInput = useRef<HTMLInputElement>(null);
  // The builder replaces the list, so focus moves into it instead of falling back to the page.
  useEffect(() => { nameInput.current?.focus(); }, []);
  // A live count (never names) as the condition changes.
  useEffect(() => {
    if (!complete) return;
    let live = true;
    const timer = setTimeout(async () => {
      const result = await previewSmartGroupCount({ organisationSlug: slug, condition: toCondition(tree) });
      if (live) setCount(result.ok ? result.data?.count ?? null : null);
    }, 400);
    return () => { live = false; clearTimeout(timer); };
  }, [tree, complete, slug]);
  const save = () => startTransition(async () => {
    setError(null);
    const result = await saveSmartGroup({ organisationSlug: slug, smartGroupId: initial?.id, name, description, condition: toCondition(tree) });
    if (!result.ok) return setError(result.fieldErrors?.name?.[0] ?? result.error);
    router.refresh();
    onClose();
  });
  return (
    <Card as="section" className="rounded-xl">
      <CardHeader title={initial ? "Edit smart group" : "New smart group"} description="Members are matched when you look, never copied. People outside your own reach are never counted." />
      <div className="flex flex-col gap-5">
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name"><Input ref={nameInput} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Description" optional><Input value={description} maxLength={300} onChange={(event) => setDescription(event.target.value)} /></Field>
        </div>
        <GroupEditor group={tree} options={options} onChange={setTree} />
        <p className="text-body-ui text-ink-secondary" aria-live="polite">{!complete ? "Fill in every condition to see how many members match." : count === null ? "Counting…" : `${count.toLocaleString("en-IN")} ${count === 1 ? "member matches" : "members match"} now.`}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="primary" loading={pending} disabled={!complete || name.trim().length < 2} onClick={save}>Save smart group</Button>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Card>
  );
}

/** Saved smart groups with their member counts, and the builder to make or change one. */
export function SmartGroupsPanel({ slug, groups, options, canManage }: { slug: string; groups: GroupRow[]; options: BuilderOptions; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<GroupRow | "new" | null>(null);
  const [removing, setRemoving] = useState<GroupRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (editing) return <Builder key={editing === "new" ? "new" : editing.id} slug={slug} options={options} initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} />;
  return (
    <div className="flex flex-col gap-4">
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      {canManage ? <div><Button type="button" variant="primary" onClick={() => setEditing("new")}><Plus aria-hidden className="size-4" />New smart group</Button></div> : null}
      {groups.length === 0 ? <EmptyState mood="sleepy">No smart groups yet. A smart group is a saved question, like active members of a plan in one region.</EmptyState> : null}
      <ul className="flex flex-col gap-3">
        {groups.map((group) => (
          <li key={group.id}>
            <Card className="rounded-xl">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/dashboard/${slug}/members?sg=${group.id}`} className="font-semibold text-ink underline-offset-4 hover:underline">{group.name}</Link>
                  <p className="text-caption text-ink-muted">{group.members.toLocaleString("en-IN")} {group.members === 1 ? "member" : "members"}{group.description ? ` · ${group.description}` : ""}{group.condition ? "" : " · This condition can't be read any more."}</p>
                  {group.usesArchivedValue ? <p className="mt-1 flex flex-wrap items-center gap-2"><Chip size="sm" tone="warning">Uses an archived value</Chip><span className="text-caption text-ink-muted">Archived grouping values match nobody. Edit the group to choose another.</span></p> : null}
                </div>
                {canManage ? (
                  <span className="flex gap-1">
                    <IconButton label={`Edit ${group.name}`} size="sm" onClick={() => setEditing(group)}><Pencil aria-hidden className="size-4" /></IconButton>
                    <IconButton label={`Delete ${group.name}`} size="sm" variant="danger" onClick={() => setRemoving(group)}><Trash2 aria-hidden className="size-4" /></IconButton>
                  </span>
                ) : null}
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={removing !== null}
        title={`Delete ${removing?.name ?? "this smart group"}?`}
        message="Only the saved condition is removed. No member changes."
        confirmLabel="Delete smart group"
        loading={pending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => startTransition(async () => {
          const result = await deleteSmartGroup({ organisationSlug: slug, smartGroupId: removing!.id });
          setError(result.ok ? null : result.error);
          setRemoving(null);
          router.refresh();
        })}
      />
    </div>
  );
}
