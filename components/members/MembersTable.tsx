"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { decideMemberships } from "@/app/actions/members";
import { RoleChip } from "@/components/members/RoleChip";
import { TermStatusChip } from "@/components/members/TermStatusChip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { TermStatus } from "@/lib/membership/lifecycle";

type MemberRowData = {
  id: string;
  memberNumber: number;
  name: string;
  email: string | null;
  unit: string | null;
  roles: Array<{ name: string; color: string; primary: boolean }>;
  standings: Array<{ planId: string; planName: string; status: TermStatus | "NONE"; endsAt: Date | null; pendingTermId: string | null }>;
};

/** Members, with bulk verify (approve) and decline for applications and imports waiting on a decision. */
export function MembersTable({ slug, rows, canManage, showUnit, validUntil }: { slug: string; rows: MemberRowData[]; canManage: boolean; showUnit: boolean; validUntil: Record<string, string> }) {
  const router = useRouter();
  const pending = useMemo(() => rows.flatMap((row) => row.standings.filter((s) => s.pendingTermId).map((s) => s.pendingTermId!)), [rows]);
  const [selected, setSelected] = useState<string[]>([]);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, startTransition] = useTransition();

  const decide = (action: "approve" | "reject") => startTransition(async () => {
    const result = await decideMemberships({ organisationSlug: slug, termIds: selected, action, reason: action === "reject" ? reason : undefined });
    setStatus(result.ok ? { ok: true, text: `${result.data?.done ?? 0} ${action === "approve" ? "verified" : "declined"}${result.data?.skipped ? `, ${result.data.skipped} skipped` : ""}.` } : { ok: false, text: result.error });
    setDeclining(false);
    setReason("");
    setSelected([]);
    router.refresh();
  });

  return (
    <div className="flex flex-col gap-3">
      {status ? <Callout tone={status.ok ? "success" : "danger"} role={status.ok ? "status" : "alert"}>{status.text}</Callout> : null}
      {canManage && selected.length ? (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel px-4 py-2.5 shadow-float">
          <span className="text-label text-ink">{selected.length} selected</span>
          <Button size="sm" variant="primary" loading={busy} onClick={() => decide("approve")}>Verify</Button>
          <Button size="sm" variant="dangerOutline" disabled={busy} onClick={() => setDeclining(true)}>Decline…</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear</Button>
        </div>
      ) : null}
      <Table label="Members">
        <THead>
          <tr>
            {canManage && pending.length ? (
              <TH className="w-10">
                <Checkbox aria-label="Select every application on this page" checked={selected.length > 0 && selected.length === pending.length} onCheckedChange={(checked) => setSelected(checked === true ? pending : [])} />
              </TH>
            ) : null}
            <TH>Member</TH>
            {showUnit ? <TH>Unit</TH> : null}
            <TH>Roles</TH>
            <TH>Memberships</TH>
          </tr>
        </THead>
        <TBody>
          {rows.map((row) => {
            const termIds = row.standings.filter((s) => s.pendingTermId).map((s) => s.pendingTermId!);
            const checked = termIds.length > 0 && termIds.every((id) => selected.includes(id));
            return (
              <TR key={row.id}>
                {canManage && pending.length ? (
                  <TD className="align-top">
                    {termIds.length ? (
                      <Checkbox aria-label={`Select ${row.name}'s application`} checked={checked} onCheckedChange={(value) => setSelected((current) => (value === true ? [...new Set([...current, ...termIds])] : current.filter((id) => !termIds.includes(id))))} />
                    ) : null}
                  </TD>
                ) : null}
                <TD className="align-top">
                  <Link href={`/dashboard/${slug}/members/${row.id}`} className="font-semibold text-ink underline-offset-4 hover:underline">{row.name}</Link>
                  <span className="block text-caption tabular-nums text-ink-muted">No. {row.memberNumber}{row.email ? ` · ${row.email}` : ""}</span>
                </TD>
                {showUnit ? <TD className="align-top text-ink-secondary">{row.unit ?? "—"}</TD> : null}
                <TD className="align-top">
                  <span className="flex flex-wrap gap-1">{row.roles.length ? row.roles.map((role) => <RoleChip key={role.name} {...role} />) : <span className="text-ink-muted">—</span>}</span>
                </TD>
                <TD className="align-top">
                  <span className="flex flex-col items-start gap-1">
                    {row.standings.length === 0 ? <span className="text-ink-muted">No plan yet</span> : row.standings.map((standing) => (
                      <span key={standing.planId} className="flex flex-wrap items-center gap-2">
                        <TermStatusChip status={standing.status} prefix={standing.planName} />
                        {validUntil[`${row.id}:${standing.planId}`] ? <span className="text-caption text-ink-muted">until {validUntil[`${row.id}:${standing.planId}`]}</span> : null}
                      </span>
                    ))}
                  </span>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      <ConfirmDialog
        open={declining}
        title={`Decline ${selected.length} ${selected.length === 1 ? "application" : "applications"}?`}
        message="Each applicant is emailed your note."
        confirmLabel="Decline"
        loading={busy}
        onCancel={() => setDeclining(false)}
        onConfirm={() => decide("reject")}
      >
        <Field label="Note to the applicants" required>
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={1000} />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
