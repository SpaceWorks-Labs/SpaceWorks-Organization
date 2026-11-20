"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsRow } from "@/components/ui/display";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { StatusPill } from "@/components/super-admin/StatusPill";

type Row = { id: string; name: string; enabled: boolean };

/**
 * The operator's single sign-on providers of one kind: a row each (status, Edit, Remove behind a confirmation), the
 * editor in place of the row being edited, and "Add a provider". `editor` gets the row (null for a new one) and a
 * callback to close it.
 */
export function ProviderList<T extends Row>({ rows, kind, detail, editor, onRemove }: { rows: T[]; kind: string; detail: (row: T) => ReactNode; editor: (row: T | null, done: () => void) => ReactNode; onRemove: (id: string) => Promise<unknown> }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<T | null>(null);
  const [pending, start] = useTransition();
  const done = () => setEditing(null);
  return (
    <div className="flex flex-col">
      {rows.map((row) => editing === row.id ? <div key={row.id}>{editor(row, done)}</div> : (
        <SettingsRow key={row.id} title={row.name} description={detail(row)}>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill state={row.enabled ? "available" : "switched_off"} />
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => setEditing(row.id)}>Edit</Button>
            <Button variant="danger" size="sm" disabled={pending} aria-label={`Remove ${row.name}`} onClick={() => setRemoving(row)}>Remove</Button>
          </div>
        </SettingsRow>
      ))}
      {rows.length === 0 && editing !== "new" ? <p className="rounded-xl border border-dashed border-line px-4 py-5 text-body-ui text-ink-muted">No {kind} providers yet.</p> : null}
      {editing === "new" ? editor(null, done) : <div className="pt-4"><Button variant="secondary" startIcon={<Plus />} onClick={() => setEditing("new")}>Add a provider</Button></div>}
      <ConfirmationDialog
        open={removing !== null}
        title={`Remove ${removing?.name ?? "this provider"}?`}
        message="Its sign-in button disappears at once, and anyone who signed in with it will need another way in."
        confirmLabel="Remove provider"
        loading={pending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => { const row = removing; setRemoving(null); if (row) start(async () => { await onRemove(row.id); }); }}
      />
    </div>
  );
}

/** The frame around an add or edit form: a bordered inset with its own heading. */
export function ProviderEditorFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="my-3 flex flex-col gap-4 rounded-xl border border-line bg-subtle p-4 sm:p-5">
      <h3 className="text-h4 text-ink">{title}</h3>
      {children}
    </section>
  );
}
