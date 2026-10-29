"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideMemberships, extendMembership, renewMember } from "@/app/actions/members";
import { Patch } from "@/components/brand/Patch";
import { TermStatusChip } from "@/components/members/TermStatusChip";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Dropdown, Field, Input, Textarea } from "@/components/ui/field";
import type { TermStatus } from "@/lib/membership/lifecycle";

export type TermView = { id: string; status: TermStatus; kind: string; dates: string; amount: string; reason: string | null; lastDay: string | null };
export type MembershipView = { planId: string; planName: string; status: TermStatus | "NONE"; terms: TermView[] };

type Dialog = { kind: "reject" | "revoke" | "cancel" | "extend"; termId: string; lastDay?: string | null } | null;

/** Each plan the member has held, with the actions its current state allows. */
export function MembershipPanel({ slug, memberId, memberships, plans, canManage }: { slug: string; memberId: string; memberships: MembershipView[]; plans: Array<{ id: string; name: string }>; canManage: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reason, setReason] = useState("");
  const [lastDay, setLastDay] = useState("");
  const [addPlan, setAddPlan] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string; sneeze?: boolean } | null>(null);
  const [busy, startTransition] = useTransition();
  const done = (result: { ok: boolean; error?: string }, text: string, sneeze = false) => {
    setStatus(result.ok ? { ok: true, text, sneeze } : { ok: false, text: result.error ?? "Couldn't save." });
    setDialog(null);
    setReason("");
    router.refresh();
  };
  const decide = (termId: string, action: "approve" | "reject" | "cancel" | "revoke" | "reinstate", text: string) =>
    startTransition(async () => done(await decideMemberships({ organisationSlug: slug, termIds: [termId], action, reason }), text, action === "approve"));
  const renew = (planId: string) => startTransition(async () => done(await renewMember({ organisationSlug: slug, memberId, planId }), "Renewal started. The member is emailed how to pay."));
  const available = plans.filter((plan) => !memberships.some((m) => m.planId === plan.id));

  return (
    <Card as="section" className="rounded-xl">
      <CardHeader title="Memberships" />
      <div className="flex flex-col gap-5">
        {/* Letting a member in is the pack deciding together, so Patch sneezes its vote (once). */}
        {status ? (
          <div className="flex items-center gap-1">
            {status.sneeze ? <Patch key={status.text} pose="sneeze" size={64} className="-my-2 -ml-2" /> : null}
            <Callout tone={status.ok ? "success" : "danger"} role={status.ok ? "status" : "alert"} className="min-w-0 flex-1">{status.text}</Callout>
          </div>
        ) : null}
        {memberships.length === 0 ? <p className="text-body-ui text-ink-secondary">No memberships yet.</p> : null}
        {memberships.map((membership) => {
          const open = membership.terms.some((t) => ["PENDING_APPROVAL", "PENDING_PAYMENT", "UPCOMING"].includes(t.status));
          return (
            <section key={membership.planId} className="flex flex-col gap-3 rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-h4 text-ink">{membership.planName}</h3>
                <TermStatusChip status={membership.status} size="md" />
              </div>
              <ol className="flex flex-col divide-y divide-line">
                {membership.terms.map((term) => (
                  <li key={term.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-label text-ink">{term.dates}</span>
                      <span className="text-caption text-ink-muted">{term.kind === "RENEWAL" ? "Renewal" : term.kind === "REINSTATEMENT" ? "Reinstated" : "Joined"} · {term.amount}{term.reason ? ` · “${term.reason}”` : ""}</span>
                    </span>
                    <TermStatusChip status={term.status} />
                    {canManage ? (
                      <span className="flex flex-wrap gap-1.5">
                        {term.status === "PENDING_APPROVAL" ? (<>
                          <Button size="sm" variant="primary" disabled={busy} onClick={() => decide(term.id, "approve", "Verified. The member has been emailed.")}>Verify</Button>
                          <Button size="sm" variant="dangerOutline" disabled={busy} onClick={() => setDialog({ kind: "reject", termId: term.id })}>Decline</Button>
                        </>) : null}
                        {term.status === "PENDING_PAYMENT" ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDialog({ kind: "cancel", termId: term.id })}>Cancel</Button> : null}
                        {["ACTIVE", "GRACE", "UPCOMING"].includes(term.status) ? (<>
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setLastDay(term.lastDay ?? ""); setDialog({ kind: "extend", termId: term.id, lastDay: term.lastDay }); }}>Change end date</Button>
                          <Button size="sm" variant="dangerQuiet" disabled={busy} onClick={() => setDialog({ kind: "revoke", termId: term.id })}>Revoke</Button>
                        </>) : null}
                        {term.status === "REVOKED" ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => decide(term.id, "reinstate", "Reinstated.")}>Reinstate</Button> : null}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
              {canManage && !open && ["ACTIVE", "GRACE", "LAPSED", "ENDED", "EXPIRED", "CANCELLED", "REJECTED"].includes(membership.status) ? (
                <div><Button size="sm" variant="secondary" disabled={busy} onClick={() => renew(membership.planId)}>{membership.status === "ACTIVE" || membership.status === "GRACE" ? "Start renewal" : "Rejoin"}</Button></div>
              ) : null}
            </section>
          );
        })}
        {canManage && available.length ? (
          <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); if (addPlan) renew(addPlan); }}>
            <Field label="Add to another plan" className="min-w-[14rem] flex-1">
              <Dropdown value={addPlan} onChange={(event) => setAddPlan(event.target.value)}>
                <option value="">Choose a plan</option>
                {available.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
              </Dropdown>
            </Field>
            <Button type="submit" variant="secondary" disabled={!addPlan || busy}>Add</Button>
          </form>
        ) : null}
      </div>

      <ConfirmDialog
        open={dialog !== null}
        title={dialog?.kind === "reject" ? "Decline this application?" : dialog?.kind === "revoke" ? "Revoke this membership?" : dialog?.kind === "cancel" ? "Cancel this unpaid membership?" : "Change the end date"}
        message={dialog?.kind === "revoke" ? "The card stops being valid at once. The member is emailed your note." : dialog?.kind === "reject" ? "The applicant is emailed your note." : undefined}
        confirmLabel={dialog?.kind === "extend" ? "Save date" : dialog?.kind === "cancel" ? "Cancel membership" : dialog?.kind === "reject" ? "Decline" : "Revoke"}
        destructive={dialog?.kind !== "extend"}
        loading={busy}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          if (!dialog) return;
          if (dialog.kind === "extend") startTransition(async () => done(await extendMembership({ organisationSlug: slug, termId: dialog.termId, lastDay, reason }), "End date changed."));
          else decide(dialog.termId, dialog.kind, dialog.kind === "cancel" ? "Cancelled." : dialog.kind === "reject" ? "Declined. The applicant has been emailed." : "Revoked.");
        }}
      >
        {dialog?.kind === "extend" ? <Field label="Last valid day" required><Input type="date" value={lastDay} onChange={(event) => setLastDay(event.target.value)} /></Field> : null}
        {dialog && dialog.kind !== "cancel" ? (
          <Field label={dialog.kind === "extend" ? "Reason" : "Note to the member"} required>
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={1000} />
          </Field>
        ) : null}
      </ConfirmDialog>
    </Card>
  );
}
