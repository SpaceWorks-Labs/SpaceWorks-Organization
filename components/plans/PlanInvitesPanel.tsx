"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { createMemberInvite, revokeMemberInvite } from "@/app/actions/join";
import { Button } from "@/components/ui/button";
import { Callout, EmptyState } from "@/components/ui/display";
import { Dropdown, Field, Input } from "@/components/ui/field";

type InviteRow = { id: string; token: string; email: string | null; uses: number; maxUses: number; expiresAt: Date | null };

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </Button>
  );
}

/** The plan's public join link, and invitations: personal ones are emailed; shared links have a use limit. */
export function PlanInvitesPanel({ slug, planId, planSlug, joinUrlBase, invites, units }: { slug: string; planId: string; planSlug: string; joinUrlBase: string; invites: InviteRow[]; units: Array<{ id: string; name: string; level: number }> }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [maxUses, setMaxUses] = useState("25");
  const [unitId, setUnitId] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const joinUrl = `${joinUrlBase}/o/${slug}/join/${planSlug}`;

  const create = () => startTransition(async () => {
    setStatus(null);
    const result = await createMemberInvite({ organisationSlug: slug, planId, email, unitId: unitId || null, maxUses: email ? 1 : maxUses });
    if (!result.ok) setStatus({ ok: false, text: result.error });
    else {
      setStatus({ ok: true, text: email ? `Invitation emailed to ${email}.` : "Shared link created. Copy it below." });
      setEmail("");
      router.refresh();
    }
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted px-4 py-3">
        <span className="min-w-0 flex-1 truncate text-body-ui tabular-nums text-ink-secondary">{joinUrl}</span>
        <CopyButton text={joinUrl} label="Copy join link" />
      </div>

      <form className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,12rem)_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); create(); }}>
        <Field label="Invite by email" optional helperText="Leave empty for a shared link.">
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" />
        </Field>
        <Field label="Uses">
          <Input inputMode="numeric" value={email ? "1" : maxUses} disabled={Boolean(email)} onChange={(event) => setMaxUses(event.target.value.replace(/\D/g, ""))} />
        </Field>
        {units.length ? (
          <Field label="Unit" optional>
            <Dropdown value={unitId} onChange={(event) => setUnitId(event.target.value)}>
              <option value="">Their choice</option>
              {units.map((unit) => <option key={unit.id} value={unit.id}>{`${"— ".repeat(unit.level)}${unit.name}`}</option>)}
            </Dropdown>
          </Field>
        ) : <span />}
        <Button type="submit" variant="primary" loading={pending}>{email ? "Send invite" : "Create link"}</Button>
      </form>
      {status ? <Callout tone={status.ok ? "success" : "danger"} role={status.ok ? "status" : "alert"}>{status.text}</Callout> : null}

      {invites.length === 0 ? <EmptyState mood="sleepy">No open invitations.</EmptyState> : (
        <ul className="flex flex-col divide-y divide-line">
          {invites.map((invite) => (
            <li key={invite.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-label font-semibold text-ink">{invite.email ?? "Shared link"}</span>
                <span className="text-caption text-ink-muted">
                  {invite.uses} of {invite.maxUses} used{invite.expiresAt ? ` · until ${invite.expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                </span>
              </span>
              {!invite.email ? <CopyButton text={`${joinUrl}?invite=${invite.token}`} label="Copy link" /> : null}
              <Button size="sm" variant="dangerQuiet" onClick={() => startTransition(async () => { await revokeMemberInvite({ organisationSlug: slug, inviteId: invite.id }); router.refresh(); })}>Revoke</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
