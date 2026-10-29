import { periodBuckets } from "@/lib/reports/period";
import { openReport, reportShell } from "@/lib/reports/shell";
import { loadRefunds, loadTaxDocuments } from "@/lib/reports/finance/source";
import { documentsIn, seriesChecks, table13 } from "@/lib/reports/finance/documents";
import { gstr1, gstr3b, monthlyLiability, simpleTaxSummary } from "@/lib/reports/finance/gst";
import type { ReportSearch } from "@/lib/reports/context";

type Props = { params: Promise<{ orgSlug: string }>; searchParams: Promise<ReportSearch & { month?: string }> };

/**
 * B6 documents register with the gapless check, and B7 tax: GSTR-1 tables for one return month, the
 * GSTR-3B liability, monthly liability over the period, and the SIMPLE-tax summary. Documents are never
 * narrowed by unit or plan for the continuity check: a gap is a gap in the whole series.
 */
export async function loadOrgReportsTax({ params, searchParams }: Props) {
  const search = await searchParams;
  const ctx = await openReport(params, Promise.resolve(search), "reports.finance");
  const { now, period, scope, org } = ctx;
  const whole = { ...scope, unitPath: null, unitId: null, planId: null };
  // The series checks span the organisation's whole series, so a viewer scoped to a unit never gets them, and
  // their refunds stay inside their units too.
  const [allDocuments, scopedDocuments, refunds] = await Promise.all([ctx.team.unitPath ? null : loadTaxDocuments(whole), scope.unitPath || scope.planId ? loadTaxDocuments(scope) : null, loadRefunds(ctx.team.unitPath ? scope : whole)]);
  const documents = scopedDocuments ?? allDocuments ?? [];
  const months = periodBuckets(period, org.timezone, "month").filter((bucket) => bucket.from <= now);
  const month = months.find((bucket) => bucket.key === search.month) ?? months.at(-1) ?? null;
  const monthWindow = month ? { from: month.from, to: month.to } : period;
  const inPeriod = documentsIn(documents, period);
  const gst = documents.some((doc) => doc.kind === "TAX_INVOICE" || doc.cgstMinor + doc.sgstMinor + doc.igstMinor > 0);
  return {
    shell: reportShell(ctx, "tax"),
    locale: org.locale,
    supplierState: org.stateCode,
    checks: allDocuments ? seriesChecks(allDocuments) : null,
    register: { rows: inPeriod.slice(0, 100), total: inPeriod.length },
    gst,
    months: months.map((bucket) => ({ key: bucket.key, label: bucket.label })),
    month: month ? { key: month.key, label: month.label } : null,
    gstr1: gst ? gstr1(documents, refunds, monthWindow, org.stateCode) : null,
    /** The GSTR-1 JSON covers the whole registration: `reports.gstr1`, refused to staff limited to one unit. */
    canDownloadGstr1: ctx.can("reports.gstr1"),
    gstr3b: gst ? gstr3b(documents, refunds, monthWindow, org.stateCode) : null,
    table13: table13(documents, monthWindow),
    liability: gst ? monthlyLiability(documents, months) : [],
    simple: simpleTaxSummary(documents, period, org.currency),
  };
}

export type OrgReportsTax = Awaited<ReturnType<typeof loadOrgReportsTax>>;
