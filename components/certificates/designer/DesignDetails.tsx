"use client";

import { SegmentedControl } from "@/components/ui/choice";
import { Field, Input } from "@/components/ui/field";
import { Dropdown } from "@/components/ui/select";
import { sampleNumberUnits } from "@/components/cards/designer/sample";
import { formatCardNumberFrom, normalizeNumberFormat } from "@/lib/cards/numbering";
import { certificateNumberFormatError } from "@/lib/certificates/design";
import { NAME_MAX, TYPE_LABEL_MAX, type CertificateOrientation, type CertificatePage, type CertificatePageSize } from "@/lib/certificates/pages";
import type { CertificateDetails } from "./useCertificateAutosave";

const TOKENS = ["{PREFIX}", "{SEQ:4}", "{MEMBER:4}", "{YYYY}", "{YY}", "{UNIT}", "{U1}", "{U2}"] as const;
const PREFIX = /^[A-Z0-9]{2,6}$/;

/**
 * What the design is called and what it prints on: its name (a label for the team, changed at once), its type
 * (printed as {title} when an issue leaves the title empty), the page, and the certificate number prefix and
 * pattern. Everything but the name waits for the owner's approval like the layers do.
 */
export function DesignDetails({ details, page, pageSizes, orientations, unitLevels, pageBusy, onChange, onPage }: {
  details: CertificateDetails;
  page: CertificatePage;
  pageSizes: Array<{ value: string; label: string }>;
  orientations: Array<{ value: string; label: string }>;
  unitLevels: readonly string[];
  /** A page change is being saved; the designer reloads at the new size afterwards. */
  pageBusy: boolean;
  onChange: (next: CertificateDetails) => void;
  onPage: (next: CertificatePage) => void;
}) {
  const formatError = details.numberFormat ? certificateNumberFormatError(details.numberFormat) : "Type a pattern, for example {PREFIX}-{SEQ:4}.";
  const prefixError = PREFIX.test(details.numberPrefix) ? null : "Use 2 to 6 capital letters or digits. The prefix isn't saved until then.";
  const example = formatError ? "" : formatCardNumberFrom(normalizeNumberFormat(details.numberFormat), { prefix: details.numberPrefix || "C", seq: 7, memberNumber: 42, year: new Date().getFullYear(), ...sampleNumberUnits(unitLevels) });
  return (
    <div className="flex flex-col gap-4">
      <Field label="Design name" helperText="Only your team sees it." error={details.name.trim() ? undefined : "Give the design a name. It isn't saved until then."}>
        <Input value={details.name} maxLength={NAME_MAX} onChange={(event) => onChange({ ...details, name: event.target.value })} />
      </Field>
      <Field label="Certificate type" helperText="For example Membership, Appreciation or Course completion. Prints as {title} when you leave the title empty at issue." error={details.typeLabel.trim() ? undefined : "Give it a type. It isn't saved until then."}>
        <Input value={details.typeLabel} maxLength={TYPE_LABEL_MAX} onChange={(event) => onChange({ ...details, typeLabel: event.target.value })} />
      </Field>
      <Field label="Page size">
        <Dropdown value={page.pageSize} disabled={pageBusy} onChange={(event) => onPage({ ...page, pageSize: event.target.value as CertificatePageSize })}>
          {pageSizes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Dropdown>
      </Field>
      <div className="flex flex-col gap-1.5">
        <SegmentedControl<CertificateOrientation> ariaLabel="Orientation" size="sm" value={page.orientation} onValueChange={(orientation) => { if (!pageBusy) onPage({ ...page, orientation }); }} options={orientations.map((option) => ({ value: option.value as CertificateOrientation, label: option.label }))} className="self-start" />
        <p className="text-caption text-ink-muted">{pageBusy ? "Changing the page…" : "Changing the page re-lays your layers to fit and starts a new undo history."}</p>
      </div>
      <Field label="Certificate number prefix" error={prefixError ?? undefined}>
        <Input value={details.numberPrefix} maxLength={6} onChange={(event) => onChange({ ...details, numberPrefix: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} className="w-[10rem] uppercase tabular-nums" />
      </Field>
      <Field label="Certificate number pattern" error={formatError ? `${formatError} The pattern isn't saved until then.` : undefined} helperText={formatError ? undefined : `For example ${example}. Each design keeps its own running series; numbers already given never change.`}>
        <Input value={details.numberFormat} maxLength={40} spellCheck={false} onChange={(event) => onChange({ ...details, numberFormat: event.target.value.toUpperCase() })} className="code-text uppercase" />
      </Field>
      <div role="group" aria-label="Insert into the pattern" className="flex flex-wrap gap-1.5">
        {TOKENS.map((token) => (
          <button key={token} type="button" onClick={() => onChange({ ...details, numberFormat: `${details.numberFormat}${token}`.slice(0, 40) })} className="inline-flex min-h-9 items-center rounded-full border border-line bg-panel px-2.5 code-text text-caption text-ink transition-colors duration-(--sw-dur-fast) ease-sw hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--sw-ui-focus))] motion-reduce:transition-none">
            {token}
          </button>
        ))}
      </div>
      <p className="text-caption text-ink-muted">{"{MEMBER:4} is the member number, {YYYY} restarts the series each year, {UNIT} and {U1} to {U4} are the member's unit codes (NA without one)."}</p>
    </div>
  );
}
