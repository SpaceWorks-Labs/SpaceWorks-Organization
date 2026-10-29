"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordCollection } from "@/app/actions/collection";
import type { CollectionResult } from "@/lib/payments/collection";
import { OFFLINE_METHOD_LABELS, type OfflineMethod } from "@/lib/payments/offline-methods";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Callout, Card, CardHeader, Chip } from "@/components/ui/display";
import { Dropdown, Field, Input } from "@/components/ui/field";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

type Row = { termId: string; name: string; memberNumber: number; unitName: string | null; planName: string; amount: string; waiting: boolean };
type Outcome = CollectionResult & { name: string; amount: string };

function OutcomeChip({ result, makerChecker }: { result: CollectionResult; makerChecker: boolean }) {
  if (result.outcome === "recorded") return <Chip size="sm" tone={result.settled ? "success" : "info"}>{result.settled ? "Recorded and receipted" : makerChecker ? "Recorded, waiting for confirmation" : "Recorded"}</Chip>;
  if (result.outcome === "already-paid") return <Chip size="sm" tone="neutral">Already paid</Chip>;
  return <Chip size="sm" tone="danger">Not recorded</Chip>;
}

/** Tick the members who paid, set how and when, add each paper receipt-book number, and record them together. */
export function CollectionSheetForm({ slug, rows, today, maxRows, makerChecker }: { slug: string; rows: Row[]; today: string; maxRows: number; makerChecker: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [references, setReferences] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<OfflineMethod>("cash");
  const [receivedOn, setReceivedOn] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const [pending, startTransition] = useTransition();
  const selectable = rows.filter((row) => !row.waiting);
  const allSelected = selectable.length > 0 && selectable.every((row) => selected.has(row.termId));
  const tooMany = selected.size > maxRows;

  const toggle = (termId: string, on: boolean) => setSelected((current) => {
    const next = new Set(current);
    if (on) next.add(termId);
    else next.delete(termId);
    return next;
  });

  const submit = () => startTransition(async () => {
    setError(null);
    const chosen = rows.filter((row) => selected.has(row.termId));
    const result = await recordCollection({ organisationSlug: slug, method, receivedOn, rows: chosen.map((row) => ({ termId: row.termId, reference: references[row.termId]?.trim() || null })) });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const byId = new Map(chosen.map((row) => [row.termId, row]));
    setOutcomes((result.data?.results ?? []).map((entry) => ({ ...entry, name: byId.get(entry.termId)?.name ?? "Member", amount: byId.get(entry.termId)?.amount ?? "" })));
    setSelected(new Set());
    setReferences({});
    router.refresh();
  });

  const recorded = outcomes?.filter((entry) => entry.outcome === "recorded").length ?? 0;

  return (
    <div className="flex flex-col gap-5">
      {outcomes ? (
        <Card as="section" className="rounded-xl" aria-live="polite">
          <CardHeader title="Last sheet" description={`${recorded} of ${outcomes.length} recorded.${makerChecker && recorded ? " They get receipt numbers once someone else confirms them." : ""}`} />
          <ul className="flex flex-col gap-2">
            {outcomes.map((entry) => (
              <li key={entry.termId} className="flex flex-wrap items-center gap-2">
                <span className="text-label font-semibold text-ink">{entry.name}</span>
                <span className="text-caption tabular-nums text-ink-muted">{entry.amount}</span>
                <OutcomeChip result={entry} makerChecker={makerChecker} />
                {entry.outcome === "failed" ? <span className="text-caption text-ink-secondary">{entry.reason}</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid max-w-[560px] grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="How they paid">
          <Dropdown value={method} onChange={(event) => setMethod(event.target.value as OfflineMethod)}>
            {Object.entries(OFFLINE_METHOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Dropdown>
        </Field>
        <Field label="Received on">
          <Input type="date" value={receivedOn} max={today} onChange={(event) => setReceivedOn(event.target.value)} />
        </Field>
      </div>

      <Table label="Members who owe a fee">
        <THead>
          <tr>
            <TH className="w-10"><Checkbox checked={allSelected} disabled={!selectable.length} onCheckedChange={(value) => setSelected(value === true ? new Set(selectable.map((row) => row.termId)) : new Set())} aria-label="Select every member who can pay" /></TH>
            <TH>Member</TH>
            <TH className="hidden md:table-cell">Plan</TH>
            <TH>Amount</TH>
            <TH>Receipt book no.</TH>
          </tr>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.termId}>
              <TD><Checkbox checked={selected.has(row.termId)} disabled={row.waiting} onCheckedChange={(value) => toggle(row.termId, value === true)} aria-label={`Select ${row.name}`} /></TD>
              <TD>
                <span className="block text-label font-semibold text-ink">{row.name}</span>
                <span className="text-caption text-ink-muted">No. {row.memberNumber}{row.unitName ? ` · ${row.unitName}` : ""}</span>
              </TD>
              <TD className="hidden text-ink-secondary md:table-cell">{row.planName}</TD>
              <TD className="whitespace-nowrap tabular-nums">{row.amount}</TD>
              <TD>
                {row.waiting ? <Chip size="sm" tone="info">Waiting for confirmation</Chip> : (
                  <Input aria-label={`Receipt book number for ${row.name}`} value={references[row.termId] ?? ""} disabled={!selected.has(row.termId)} maxLength={80} className="min-w-28" onChange={(event) => setReferences((current) => ({ ...current, [row.termId]: event.target.value }))} />
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      {tooMany ? <Callout tone="warning">Record at most {maxRows} members at a time.</Callout> : null}
      <div>
        <Button loading={pending} disabled={!selected.size || tooMany || !receivedOn} onClick={submit}>
          {selected.size ? `Record ${selected.size} ${selected.size === 1 ? "payment" : "payments"}` : "Record payments"}
        </Button>
      </div>
    </div>
  );
}
