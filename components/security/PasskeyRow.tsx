"use client";

import { useState, useTransition } from "react";
import { Fingerprint, Pencil, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Chip } from "@/components/ui/display";
import { Input } from "@/components/ui/field";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { removePasskey, renamePasskey } from "@/app/actions/passkeys";
import { SecurityRow } from "./SecurityRow";

export type PasskeyItem = { id: string; name: string; synced: boolean; createdAt: string; lastUsedAt: string | null };

/** "14 Oct 2026" in UTC, so the server and browser agree. */
const date = (iso: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(iso));

/** One passkey: its name, when it was added and last used, with rename and remove. */
export function PasskeyRow({ passkey, onChanged, onError }: { passkey: PasskeyItem; onChanged: () => void; onError: (message: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(passkey.name);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = (task: () => Promise<{ ok: boolean; error?: string }>, done: () => void) =>
    startTransition(async () => {
      let result;
      try { result = await task(); } catch { onError("Passkeys are temporarily unavailable. Please try again."); return; }
      if (result.ok) done(); else onError(result.error ?? "That didn’t work. Try again.");
    });

  return (
    <SecurityRow
      icon={<Fingerprint />}
      title={editing ? undefined : <>{passkey.name}{passkey.synced ? <Chip size="sm" tone="neutral">Synced</Chip> : null}</>}
      description={`Added ${date(passkey.createdAt)} · ${passkey.lastUsedAt ? `Last used ${date(passkey.lastUsedAt)}` : "Not used yet"}`}
      actions={editing ? null : (
        <>
          <IconButton label={`Rename ${passkey.name}`} disabled={pending} onClick={() => setEditing(true)}><Pencil aria-hidden /></IconButton>
          <IconButton label={`Remove ${passkey.name}`} variant="danger" disabled={pending} onClick={() => setConfirming(true)}><Trash2 aria-hidden /></IconButton>
          <ConfirmationDialog
            open={confirming}
            title="Remove this passkey?"
            message={`“${passkey.name}” will no longer sign you in. You can add it again later.`}
            confirmLabel="Remove passkey"
            loading={pending}
            onCancel={() => setConfirming(false)}
            onConfirm={() => { setConfirming(false); run(() => removePasskey({ id: passkey.id }), onChanged); }}
          />
        </>
      )}
    >
      {editing ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => renamePasskey({ id: passkey.id, name }), () => { setEditing(false); onChanged(); });
          }}
        >
          <Input aria-label="Passkey name" value={name} maxLength={60} autoFocus onChange={(event) => setName(event.target.value)} className="max-w-60" />
          <Button type="submit" variant="primary" size="sm" disabled={pending || !name.trim()}>Save name</Button>
          <Button type="button" variant="quiet" size="sm" disabled={pending} onClick={() => { setEditing(false); setName(passkey.name); }}>Cancel</Button>
        </form>
      ) : undefined}
    </SecurityRow>
  );
}
