import Link from "next/link";
import { Download } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import type { OrgReportsTax } from "@/lib/views/app__dashboard__orgSlug__reports__tax__page";
import { formatAmount } from "@/lib/reports/money";
import { Chip, EmptyState } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { ChartFrame, DataTable } from "./charts/ChartFrame";
import { ColumnChart } from "./charts/ColumnChart";
import { ExportLink } from "./ReportShell";

type View = OrgReportsTax;
const inr = (minor: number, locale: string | null) => formatAmount(minor, "INR", locale);
const rate = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 2 : 0)}%`;
const KIND_LABELS = { RECEIPT: "Receipt", TAX_INVOICE: "Tax invoice", BILL_OF_SUPPLY: "Bill of supply", CREDIT_NOTE: "Credit note" } as const;

export function SeriesChecks({ view }: { view: View }) {
  if (!view.checks) return null;
  if (!view.checks.length) return <EmptyState mood="sleepy" title="No receipts yet">Receipts, invoices and credit notes are listed here, with a check that every number in each series is used once and none is missing.</EmptyState>;
  return (
    <section aria-labelledby="checks-title" className="flex flex-col gap-3">
      <h2 id="checks-title" className="text-h4 text-ink">Numbering check</h2>
      <Table label="Document series continuity">
        <THead><tr><TH>Series</TH><TH>Year</TH><TH>Numbers</TH><TH>Issued</TH><TH>Cancelled</TH><TH>Check</TH></tr></THead>
        <TBody>
          {view.checks.map((check) => {
            const ok = !check.gaps.length && !check.duplicates.length;
            return (
              <TR key={`${check.series}-${check.financialYear}`}>
                <TD className="font-semibold">{check.series}</TD>
                <TD>FY {check.financialYear}</TD>
                <TD className="whitespace-nowrap text-ink-secondary">{check.firstNumber} to {check.lastNumber}</TD>
                <TD className="tabular-nums">{check.issued}</TD>
                <TD className="tabular-nums">{check.cancelled}</TD>
                <TD>{ok ? <Chip size="sm" tone="success">No gaps</Chip> : <Chip size="sm" tone="danger">{check.gaps.length ? `Missing ${check.gaps.slice(0, 5).join(", ")}${check.gaps.length > 5 ? "…" : ""}` : `Repeated ${check.duplicates.join(", ")}`}</Chip>}</TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </section>
  );
}

export function DocumentRegister({ view }: { view: View }) {
  return (
    <section aria-labelledby="register-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="register-title" className="text-h4 text-ink">Documents register</h2>
          <p className="text-label text-ink-muted">{view.register.total.toLocaleString("en-IN")} documents issued in the period{view.register.total > 100 ? "; the latest 100 shown, all in the export" : ""}.</p>
        </div>
        {view.shell.canExportFinance ? <ExportLink shell={view.shell} report="documents" /> : null}
      </div>
      {view.register.rows.length ? (
        <Table label="Documents register">
          <THead><tr><TH>Number</TH><TH>Type</TH><TH>Issued</TH><TH className="text-right">Taxable</TH><TH className="text-right">Tax</TH><TH className="text-right">Total</TH></tr></THead>
          <TBody>
            {view.register.rows.map((doc) => (
              <TR key={doc.id} className={cn(doc.cancelledAt && "opacity-70")}>
                <TD className="whitespace-nowrap font-semibold">{doc.number}{doc.cancelledAt ? <Chip size="sm" tone="neutral" className="ml-2">Cancelled</Chip> : null}</TD>
                <TD className="text-ink-secondary">{KIND_LABELS[doc.kind]}</TD>
                <TD className="whitespace-nowrap text-ink-secondary">{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(doc.issuedAt))}</TD>
                <TD className="text-right tabular-nums">{formatAmount(doc.taxableMinor, doc.currency, view.locale)}</TD>
                <TD className="text-right tabular-nums">{formatAmount(doc.cgstMinor + doc.sgstMinor + doc.igstMinor + doc.otherTaxMinor, doc.currency, view.locale)}</TD>
                <TD className="text-right tabular-nums">{formatAmount(doc.totalMinor, doc.currency, view.locale)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : null}
    </section>
  );
}

/** B7: GSTR-1 tables for the chosen month and the GSTR-3B summary, in INR. */
export function GstSection({ view }: { view: View }) {
  if (!view.gst || !view.gstr1 || !view.gstr3b) return null;
  const r1 = view.gstr1;
  const r3 = view.gstr3b;
  const l = view.locale;
  const base = `/dashboard/${view.shell.org.slug}/reports/tax`;
  const monthHref = (key: string) => `${base}${view.shell.query ? `${view.shell.query}&` : "?"}month=${key}`;
  return (
    <section aria-labelledby="gst-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="gst-title" className="text-h4 text-ink">GST return figures, {view.month?.label}</h2>
          <p className="text-label text-ink-muted">Laid out like GSTR-1 and GSTR-3B. Check them with your accountant before filing.</p>
        </div>
        {view.shell.canExportFinance && view.month ? (
          <span className="flex flex-wrap gap-2">
            <ExportLink shell={view.shell} report="gstr1" label="Export GSTR-1 tables" extra={`month=${view.month.key}`} />
            {view.canDownloadGstr1 ? (
              <a href={`/api/exports/gstr1/${view.shell.org.slug}${view.shell.query ? `${view.shell.query}&` : "?"}month=${view.month.key}`} className={buttonClasses({ variant: "secondary", size: "sm", className: "sw-print-hide" })} download>
                <Download aria-hidden className="size-4" />
                GSTR-1 JSON
              </a>
            ) : null}
          </span>
        ) : null}
      </div>
      <nav aria-label="Return month" className="flex flex-wrap gap-1.5">
        {view.months.map((month) => <Link key={month.key} href={monthHref(month.key)} aria-current={view.month?.key === month.key ? "page" : undefined} className={cn("inline-flex min-h-9 items-center rounded-full border px-3 text-sm", view.month?.key === month.key ? "border-primary bg-primary font-semibold text-on-primary" : "border-line bg-panel text-ink hover:bg-muted")}>{month.label}</Link>)}
      </nav>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame title="GSTR-3B 3.1(a) outward taxable supplies" description={`Nil-rated and exempt (3.1(c)): ${inr(r3.nilExempt, l)}`}>
          <DataTable table={{ columns: ["Taxable value", "IGST", "CGST", "SGST"], rows: [[inr(r3.outwardTaxable.taxable, l), inr(r3.outwardTaxable.igst, l), inr(r3.outwardTaxable.cgst, l), inr(r3.outwardTaxable.sgst, l)]] }} />
        </ChartFrame>
        <ChartFrame title="GSTR-3B 3.2 inter-state to unregistered persons">
          {r3.interStateUnregistered.length ? <DataTable table={{ columns: ["Place of supply", "Taxable value", "IGST"], rows: r3.interStateUnregistered.map((row) => [row.placeOfSupply, inr(row.taxable, l), inr(row.igst, l)]) }} /> : <p className="text-label text-ink-muted">None this month.</p>}
        </ChartFrame>
      </div>
      <ChartFrame title="Table 7: B2C others, by place of supply and rate" description="Net of credit notes on these supplies.">
        {r1.b2cs.length ? <DataTable table={{ columns: ["Place of supply", "Type", "Rate", "Taxable value", "IGST", "CGST", "SGST"], rows: r1.b2cs.map((row) => [row.placeOfSupply, row.supplyType === "INTER" ? "Inter-state" : "Intra-state", rate(row.rateBps), inr(row.taxable, l), inr(row.igst, l), inr(row.cgst, l), inr(row.sgst, l)]) }} /> : <p className="text-label text-ink-muted">None this month.</p>}
      </ChartFrame>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame title="Table 4A: B2B (members with a GSTIN)" description={`${r1.b2b.length} invoices`}>
          {r1.b2b.length ? <DataTable table={{ columns: ["GSTIN", "Invoice", "Value", "Taxable", "Tax"], rows: r1.b2b.map((row) => [row.gstin ?? "", row.number, inr(row.value, l), inr(row.taxable, l), inr(row.igst + row.cgst + row.sgst, l)]) }} /> : <p className="text-label text-ink-muted">None this month.</p>}
        </ChartFrame>
        <ChartFrame title="Table 5: B2C large" description="Inter-state invoices over ₹1 lakh to unregistered members.">
          {r1.b2cl.length ? <DataTable table={{ columns: ["Invoice", "Place of supply", "Value", "IGST"], rows: r1.b2cl.map((row) => [row.number, row.placeOfSupply ?? "", inr(row.value, l), inr(row.igst, l)]) }} /> : <p className="text-label text-ink-muted">None this month.</p>}
        </ChartFrame>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame title="Table 12: SAC summary" description="B2B and B2C rows, UQC NA for services.">
          <DataTable table={{ columns: ["Tab", "SAC", "Rate", "Taxable", "IGST", "CGST", "SGST"], rows: [...r1.hsnB2b.map((row) => ["B2B", row.sac, rate(row.rateBps), inr(row.taxable, l), inr(row.igst, l), inr(row.cgst, l), inr(row.sgst, l)]), ...r1.hsnB2c.map((row) => ["B2C", row.sac, rate(row.rateBps), inr(row.taxable, l), inr(row.igst, l), inr(row.cgst, l), inr(row.sgst, l)])] }} />
        </ChartFrame>
        <ChartFrame title="Table 13: documents issued">
          {view.table13.length ? <DataTable table={{ columns: ["Nature", "From", "To", "Total", "Cancelled", "Net"], rows: view.table13.map((row) => [row.nature, row.from, row.to, row.total, row.cancelled, row.netIssued]) }} /> : <p className="text-label text-ink-muted">No documents this month.</p>}
        </ChartFrame>
      </div>
      {r1.cdnr.length + r1.cdnur.length ? (
        <ChartFrame title="Table 9B: credit notes" description="CDNR for registered members; CDNUR against B2C large invoices. Others are netted into Table 7.">
          <DataTable table={{ columns: ["Credit note", "Against", "Recipient", "Taxable", "Tax"], rows: [...r1.cdnr, ...r1.cdnur].map((row) => [row.number, row.againstNumber ?? "", row.gstin ?? "Unregistered", inr(row.taxable, l), inr(row.igst + row.cgst + row.sgst, l)]) }} />
        </ChartFrame>
      ) : null}
      {view.liability.length ? (
        <ChartFrame title="Tax liability each month" description="IGST + CGST + SGST on outward supplies, net of credit notes." table={{ columns: ["Month", "Taxable", "IGST", "CGST", "SGST"], rows: view.liability.map((row) => [row.label, inr(row.taxable, l), inr(row.igst, l), inr(row.cgst, l), inr(row.sgst, l)]) }}>
          <ColumnChart ariaLabel="GST liability each month" format="money:INR" labels={view.liability.map((row) => row.label)} series={[{ key: "tax", label: "Tax", slot: 1, values: view.liability.map((row) => row.igst + row.cgst + row.sgst) }]} />
        </ChartFrame>
      ) : null}
    </section>
  );
}

export function SimpleTaxSection({ view }: { view: View }) {
  if (!view.simple.length) return null;
  return (
    <ChartFrame title="Tax collected (VAT and similar)" description="Per currency and rate, net of credit notes.">
      <DataTable table={{ columns: ["Currency", "Rate", "Documents", "Taxable", "Tax"], rows: view.simple.map((row) => [row.currency, rate(row.rateBps), row.documents, formatAmount(row.taxable, row.currency, view.locale), formatAmount(row.tax, row.currency, view.locale)]) }} />
    </ChartFrame>
  );
}
