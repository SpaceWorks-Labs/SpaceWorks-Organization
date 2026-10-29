"use client";

import { useState, useTransition } from "react";
import { commitMemberImport, previewMemberImport } from "@/app/actions/member-import";
import type { ImportTarget } from "@/lib/membership/importMapping";
import { ImportFinished, ImportProblems, type ImportResult, type RowProblem } from "@/components/members/ImportResults";
import { Button } from "@/components/ui/button";
import { Radio, RadioGroup, SegmentedControl } from "@/components/ui/choice";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { Dropdown, Field, Input } from "@/components/ui/field";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

type Source = { kind: "csv"; text: string } | { kind: "sheet"; url: string };
type Preview = { headers: string[]; sample: string[][]; total: number; mapping: ImportTarget[]; ready: number; problems: RowProblem[]; mappingError: string | null };
type Membership = "none" | "start" | "verify";

const BASE_TARGETS: Array<[ImportTarget, string]> = [["skip", "Don't import"], ["name", "Name"], ["email", "Email"], ["phone", "Phone"], ["state", "State"], ["unit", "Unit"], ["role", "Role"]];

/** Bring in members from a CSV file or a shared Google Sheet: read, map columns, check every row, import. */
export function ImportWizard({ slug, plans, fields }: { slug: string; plans: Array<{ id: string; name: string }>; fields: Array<{ key: string; label: string }> }) {
  const [mode, setMode] = useState<"csv" | "sheet">("sheet");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [planId, setPlanId] = useState("");
  const [membership, setMembership] = useState<Membership>("none");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<ImportTarget[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const source: Source | null = mode === "csv" ? (file ? { kind: "csv", text: file.text } : null) : url.trim() ? { kind: "sheet", url } : null;
  const targets: Array<[ImportTarget, string]> = [...BASE_TARGETS, ...fields.map((field): [ImportTarget, string] => [`field:${field.key}`, field.label])];
  // The row checks hold for the columns they were made with; a changed match needs a fresh check.
  const checked = preview !== null && preview.mapping.join("|") === mapping.join("|") && !preview.mappingError;

  const read = (columns?: ImportTarget[]) => startTransition(async () => {
    setError(null);
    if (!source) return;
    const response = await previewMemberImport({ organisationSlug: slug, planId: planId || null, source, mapping: columns });
    if (!response.ok) return setError(response.error);
    setPreview(response.data!);
    setMapping(response.data!.mapping);
  });

  const commit = () => startTransition(async () => {
    setError(null);
    if (!source) return;
    const response = await commitMemberImport({ organisationSlug: slug, planId: planId || null, source, mapping, membership: planId ? membership : "none" });
    if (!response.ok) return setError(response.error);
    setResult(response.data!);
  });

  if (result) return <ImportFinished slug={slug} result={result} onAgain={() => { setResult(null); setPreview(null); }} />;

  return (
    <div className="flex flex-col gap-6">
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <Card as="section" className="rounded-xl">
        <CardHeader title="1. Where the members are" description="Up to 2,000 people per import. The first row must be the column names." />
        <div className="flex flex-col gap-5">
          <SegmentedControl ariaLabel="Source" value={mode} onValueChange={(value) => { setMode(value); setPreview(null); }} options={[{ value: "sheet", label: "Google Sheet" }, { value: "csv", label: "CSV file" }]} />
          {mode === "sheet" ? (
            <Field label="Google Sheet link" helperText="In Google Sheets choose Share, then General access: Anyone with the link (Viewer). The tab open in the link is the one we read.">
              <Input type="url" value={url} placeholder="https://docs.google.com/spreadsheets/d/…" onChange={(event) => { setUrl(event.target.value); setPreview(null); }} />
            </Field>
          ) : (
            <Field label="CSV file" helperText={file ? `Loaded ${file.name}` : "Export from Excel or Google Sheets as CSV."}>
              <Input type="file" accept=".csv,text/csv" onChange={async (event) => {
                const chosen = event.target.files?.[0];
                setPreview(null);
                if (!chosen) return setFile(null);
                if (chosen.size > 2 * 1024 * 1024) return setError("The file is larger than 2 MB.");
                setFile({ name: chosen.name, text: await chosen.text() });
              }} />
            </Field>
          )}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Plan" optional helperText="Its questions become columns you can map.">
              <Dropdown value={planId} onChange={(event) => { setPlanId(event.target.value); setPreview(null); }}>
                <option value="">No plan</option>
                {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
              </Dropdown>
            </Field>
          </div>
          <div><Button variant="primary" disabled={!source} loading={pending && !preview} onClick={() => read()}>Read the members</Button></div>
        </div>
      </Card>

      {preview ? (
        <Card as="section" className="rounded-xl">
          <CardHeader title="2. Match the columns" description={`${preview.total} ${preview.total === 1 ? "row" : "rows"} found. Name and email are needed; existing members with the same email are updated.`} />
          <Table label="Columns">
            <THead><tr><TH>Column</TH><TH>Goes to</TH><TH>First values</TH></tr></THead>
            <TBody>
              {preview.headers.map((header, index) => (
                <TR key={index}>
                  <TD className="font-semibold">{header || `Column ${index + 1}`}</TD>
                  <TD className="min-w-[12rem]">
                    <Dropdown aria-label={`Where ${header} goes`} value={mapping[index]} onChange={(event) => setMapping((current) => current.map((value, i) => (i === index ? (event.target.value as ImportTarget) : value)))}>
                      {targets.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </Dropdown>
                  </TD>
                  <TD className="max-w-[18rem] truncate text-ink-secondary">{preview.sample.slice(0, 3).map((row) => row[index]).filter(Boolean).join(" · ")}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {planId ? (
            <div className="mt-5 flex flex-col gap-2.5">
              <p className="text-label text-ink">On the plan</p>
              <RadioGroup value={membership} onValueChange={(value) => setMembership(value as Membership)} aria-label="On the plan">
                <Radio value="none" label="Only add them as members" description="No membership is opened." />
                <Radio value="start" label="Start a membership" description="Skips approval. Priced plans wait for payment unless they start before payment." />
                <Radio value="verify" label="Send to the unit's lead to verify" description="Each membership waits until staff for the member's unit verify it. They get one email about this import. Verifying starts the membership and emails the member their card." />
              </RadioGroup>
            </div>
          ) : null}
        </Card>
      ) : null}

      {preview ? (
        <Card as="section" className="rounded-xl">
          <CardHeader title="3. Check the rows" description="Every row is checked the way the import will check it. Rows with a problem are skipped." />
          {preview.mappingError && preview.mapping.join("|") === mapping.join("|") ? <Callout tone="warning">{preview.mappingError}</Callout> : null}
          {checked ? <ImportProblems ready={preview.ready} problems={preview.problems} total={preview.total} /> : null}
          <div className="mt-5 flex flex-wrap gap-3">
            {checked ? (
              <Button variant="primary" loading={pending} disabled={preview.ready === 0} onClick={commit}>Import {preview.ready} {preview.ready === 1 ? "member" : "members"}</Button>
            ) : (
              <Button variant="primary" loading={pending} onClick={() => read(mapping)}>Check the rows</Button>
            )}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
