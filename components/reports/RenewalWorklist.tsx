"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { sendRenewalReminders } from "@/app/actions/reports";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Chip } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

type WorklistItem = { termId: string; memberId: string; memberNumber: number; name: string; email: string; phone: string; planName: string; validUntil: string; daysLeft: number; inGrace: boolean; lastReminder: Date | null; remindedToday: boolean };

const when = (date: Date | null) => (date ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(date)) : "Never");

/**
 * B3 renewal worklist. Managers pick rows and send a reminder through the renewal-reminder email; the
 * server re-checks scope and skips anything already reminded today, renewed or no longer renewable.
 */
export function RenewalWorklist({ slug, rows, canRemind }: { slug: string; rows: WorklistItem[]; canRemind: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const selectable = rows.filter((row) => !row.remindedToday);
  const allSelected = selectable.length > 0 && selectable.every((row) => selected.has(row.termId));
  const toggle = (termId: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(termId)) next.delete(termId);
    else next.add(termId);
    return next;
  });
  const send = () => start(async () => {
    const result = await sendRenewalReminders({ organisationSlug: slug, termIds: [...selected] });
    setConfirming(false);
    if (!result.ok) return showToast(result.error, "error");
    setSelected(new Set());
    const queued = `${result.queued} ${result.queued === 1 ? "reminder" : "reminders"} queued.`;
    showToast(result.skipped ? `${queued} ${result.skipped} skipped (already reminded today or renewed).` : queued, "success");
    router.refresh();
  });

  return (
    <div className="flex flex-col gap-3">
      {canRemind ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2">
          <label className="inline-flex min-h-9 items-center gap-2 text-label text-ink">
            <Checkbox checked={allSelected} disabled={!selectable.length} onCheckedChange={(value) => setSelected(value ? new Set(selectable.map((row) => row.termId)) : new Set())} aria-label="Select every membership not reminded today" />
            Select all
          </label>
          <span className="text-label text-ink-muted">{selected.size ? `${selected.size} selected` : "Pick members to remind"}</span>
          <Button className="ml-auto" size="sm" disabled={!selected.size || pending} onClick={() => setConfirming(true)}>
            <Send aria-hidden className="size-4" />
            Send reminder
          </Button>
        </div>
      ) : null}
      <Table label="Memberships due for renewal">
        <THead>
          <tr>
            {canRemind ? <TH className="w-10"><span className="sr-only">Select</span></TH> : null}
            <TH>Member</TH>
            <TH>Plan</TH>
            <TH>Valid until</TH>
            <TH className="hidden sm:table-cell">Last reminder</TH>
          </tr>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.termId}>
              {canRemind ? (
                <TD>
                  <Checkbox checked={selected.has(row.termId)} disabled={row.remindedToday} onCheckedChange={() => toggle(row.termId)} aria-label={`Select ${row.name}`} />
                </TD>
              ) : null}
              <TD>
                <Link href={`/dashboard/${slug}/members/${row.memberId}`} className="font-semibold text-ink underline-offset-4 hover:underline">{row.name}</Link>
                <span className="block text-caption text-ink-muted">#{row.memberNumber}{row.email ? ` · ${row.email}` : ""}</span>
              </TD>
              <TD className="text-ink-secondary">{row.planName}</TD>
              <TD className="whitespace-nowrap">
                <span className="block text-ink">{row.validUntil}</span>
                {row.inGrace ? <Chip size="sm" tone="warning">In grace</Chip> : <span className="text-caption text-ink-muted">{row.daysLeft <= 0 ? "Ends today" : `${row.daysLeft} ${row.daysLeft === 1 ? "day" : "days"} left`}</span>}
              </TD>
              <TD className="hidden whitespace-nowrap text-ink-secondary sm:table-cell">{row.remindedToday ? "Today" : when(row.lastReminder)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <ConfirmationDialog
        open={confirming}
        title={`Send ${selected.size} renewal ${selected.size === 1 ? "reminder" : "reminders"}?`}
        message="Each member gets the renewal email with a link to renew. Anyone already reminded today is skipped."
        confirmLabel="Send reminders"
        destructive={false}
        loading={pending}
        onConfirm={send}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
