"use client";

import Link from "next/link";
import { Button, buttonClasses } from "@/components/ui/button";
import { Callout, Card, CardHeader, StatTile } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export type RowProblem = { row: number; reason: string };
export type ImportResult = { created: number; updated: number; waiting: number; skipped: RowProblem[] };

/** Rows the import will skip, by row number as the spreadsheet shows them. */
export function ImportProblems({ ready, problems, total }: { ready: number; problems: RowProblem[]; total: number }) {
  const flagged = total - ready;
  if (!flagged) return <Callout tone="success" role="status">All {total} {total === 1 ? "row is" : "rows are"} ready to import.</Callout>;
  return (
    <div className="flex flex-col gap-3">
      <Callout tone="warning" role="status">
        {ready} {ready === 1 ? "row is" : "rows are"} ready. {flagged} {flagged === 1 ? "row has a problem and will be skipped" : "rows have a problem and will be skipped"}. Fix them in the sheet and read it again, or import the rest now.
      </Callout>
      <Table label="Rows with a problem">
        <THead><tr><TH className="w-20">Row</TH><TH>Problem</TH></tr></THead>
        <TBody>
          {problems.map((problem) => (
            <TR key={problem.row}><TD className="tabular-nums">{problem.row}</TD><TD>{problem.reason}</TD></TR>
          ))}
        </TBody>
      </Table>
      {problems.length < flagged ? <p className="text-caption text-ink-muted">Showing the first {problems.length}.</p> : null}
    </div>
  );
}

/** What the import did. */
export function ImportFinished({ slug, result, onAgain }: { slug: string; result: ImportResult; onAgain: () => void }) {
  return (
    <Card as="section" className="rounded-xl">
      <CardHeader title="Import finished" description={result.waiting ? "The staff who verify members in their units have been emailed once about this import." : undefined} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <StatTile label="New members" value={result.created} />
        <StatTile label="Updated" value={result.updated} />
        <StatTile label="Waiting to be verified" value={result.waiting} />
        <StatTile label="Skipped" value={result.skipped.length} tone={result.skipped.length ? "attention" : "default"} />
      </div>
      {result.skipped.length ? (
        <ul className="mt-4 flex flex-col gap-1 text-body-ui text-ink-secondary">
          {result.skipped.map((row) => <li key={row.row}>Row {row.row}: {row.reason}</li>)}
        </ul>
      ) : null}
      <div className="mt-5 flex gap-3">
        <Link href={result.waiting ? `/dashboard/${slug}/members?status=approval` : `/dashboard/${slug}/members`} className={buttonClasses({ variant: "primary" })}>See members</Link>
        <Button variant="secondary" onClick={onAgain}>Import more</Button>
      </div>
    </Card>
  );
}
