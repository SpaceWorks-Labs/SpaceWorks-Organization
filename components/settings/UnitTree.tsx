"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { createUnit, setUnitArchived, updateUnit } from "@/app/actions/units";
import { slugFromName } from "@/components/onboarding/SlugField";
import { Button, IconButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Callout, Chip, EmptyState } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { unitCodeBase } from "@/lib/structure/units";

type UnitRow = { id: string; name: string; slug: string; code: string; level: number; parentId: string | null; archivedAt: Date | null; members: number; subtreeMembers: number };

const codeInput = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

function UnitForm({ slug, parentId, levelName, onDone }: { slug: string; parentId: string | null; levelName: string; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createUnit({ organisationSlug: slug, name, slug: slugFromName(name), code: code || undefined, parentId });
          if (!result.ok) setError(result.error);
          else {
            router.refresh();
            onDone();
          }
        });
      }}
    >
      <Field label={`New ${levelName.toLowerCase()} name`} error={error ?? undefined} className="flex-1">
        <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus maxLength={80} />
      </Field>
      <Field label="Code" helperText="Used in card numbers and join links." className="sm:w-32">
        <Input value={code} placeholder={name.trim() ? unitCodeBase(name) : "KZK"} onChange={(event) => setCode(codeInput(event.target.value))} maxLength={6} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" loading={pending} disabled={name.trim().length < 2}>Add</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

function UnitItem({ unit, slug, levels, disabled }: { unit: UnitRow; slug: string; levels: string[]; disabled: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "edit" | "add" | "archive">("idle");
  const [name, setName] = useState(unit.name);
  const [code, setCode] = useState(unit.code);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (task: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const result = await task();
      if (!result.ok) setError(result.error ?? "Couldn't save.");
      else router.refresh();
      setMode("idle");
    });
  const levelName = levels[unit.level] ?? "Unit";
  const childLevel = levels[unit.level + 1];

  return (
    <li className="flex flex-col gap-2">
      <div className={cn("flex min-h-12 flex-wrap items-center gap-3 rounded-xl px-3 py-2 hover:bg-subtle", unit.archivedAt && "opacity-60")} style={{ marginLeft: `${unit.level * 1.5}rem` }}>
        {mode === "edit" ? (
          <form className="flex flex-1 flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); run(() => updateUnit({ organisationSlug: slug, unitId: unit.id, name, code })); }}>
            <Input aria-label="Unit name" value={name} onChange={(event) => setName(event.target.value)} autoFocus className="min-h-9 min-w-40 flex-1" />
            <Input aria-label="Unit code" value={code} onChange={(event) => setCode(codeInput(event.target.value))} className="min-h-9 w-24" />
            <Button type="submit" size="sm" variant="primary" loading={pending}>Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setName(unit.name); setCode(unit.code); setMode("idle"); }}>Cancel</Button>
          </form>
        ) : (
          <>
            <span className="min-w-0 flex-1">
              <Link href={`/dashboard/${slug}/settings/structure/${unit.id}`} className="text-label font-semibold text-ink underline-offset-4 hover:underline">{unit.name}</Link>
              <span className="ml-2 text-caption text-ink-muted">{levelName} · {unit.code} · {unit.members} {unit.members === 1 ? "member" : "members"}</span>
            </span>
            {unit.archivedAt ? <Chip size="sm" tone="neutral">Archived</Chip> : null}
            {!disabled ? (
              <span className="flex items-center gap-1">
                {childLevel && !unit.archivedAt ? (
                  <Button size="sm" variant="ghost" onClick={() => setMode("add")}>
                    <Plus aria-hidden className="size-3.5" />
                    {childLevel}
                  </Button>
                ) : null}
                <IconButton label={`Edit ${unit.name}`} variant="quiet" size="sm" onClick={() => setMode("edit")}>
                  <Pencil aria-hidden className="size-3.5" />
                </IconButton>
                <IconButton
                  label={unit.archivedAt ? `Restore ${unit.name}` : `Archive ${unit.name} and everything under it`}
                  variant="quiet"
                  size="sm"
                  disabled={pending}
                  onClick={() => (unit.archivedAt ? run(() => setUnitArchived({ organisationSlug: slug, unitId: unit.id, archived: false })) : setMode("archive"))}
                >
                  {unit.archivedAt ? <ArchiveRestore aria-hidden className="size-3.5" /> : <Archive aria-hidden className="size-3.5" />}
                </IconButton>
              </span>
            ) : null}
          </>
        )}
      </div>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      {mode === "add" && childLevel ? (
        <div style={{ marginLeft: `${(unit.level + 1) * 1.5}rem` }}>
          <UnitForm slug={slug} parentId={unit.id} levelName={childLevel} onDone={() => setMode("idle")} />
        </div>
      ) : null}
      <ConfirmDialog
        open={mode === "archive"}
        title={`Archive ${unit.name}?`}
        message={`${unit.subtreeMembers} ${unit.subtreeMembers === 1 ? "member belongs" : "members belong"} to this ${levelName.toLowerCase()} and the units under it. They keep their unit, but new members can't choose it. You can restore it later.`}
        confirmLabel="Archive"
        loading={pending}
        onCancel={() => setMode("idle")}
        onConfirm={() => run(() => setUnitArchived({ organisationSlug: slug, unitId: unit.id, archived: true }))}
      />
    </li>
  );
}

/** The organisation's units as an indented tree. Archiving a unit archives everything under it. */
export function UnitTree({ slug, levels, units, disabled }: { slug: string; levels: string[]; units: UnitRow[]; disabled: boolean }) {
  const [adding, setAdding] = useState(false);
  if (levels.length === 0) return <EmptyState mood="sleepy">Name at least one level above to start adding units.</EmptyState>;
  return (
    <div className="flex flex-col gap-3">
      {units.length === 0 ? <EmptyState mood="sleepy">No units yet.</EmptyState> : (
        <ul className="flex flex-col gap-1">
          {units.map((unit) => <UnitItem key={unit.id} unit={unit} slug={slug} levels={levels} disabled={disabled} />)}
        </ul>
      )}
      {!disabled ? (adding ? <UnitForm slug={slug} parentId={null} levelName={levels[0]} onDone={() => setAdding(false)} /> : (
        <div>
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <Plus aria-hidden className="size-4" />
            Add a {levels[0].toLowerCase()}
          </Button>
        </div>
      )) : null}
    </div>
  );
}
