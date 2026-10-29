/**
 * B6 documents register: every receipt, invoice, bill of supply and credit note, with a continuity check
 * per (series, financial year), and GSTR-1 Table 13 (documents issued). Pure. Definitions: docs/REPORTS.md
 * "Documents register".
 */
import type { FinanceTaxDocument, TaxDocumentKind } from "./types";
import type { Window } from "./revenue";

type SeriesCheck = {
  series: string;
  financialYear: string;
  kinds: TaxDocumentKind[];
  first: number;
  last: number;
  issued: number;
  cancelled: number;
  /** Sequence numbers missing between 1 and the last one issued (should always be empty). */
  gaps: number[];
  /** Numbers that appear more than once (should always be empty). */
  duplicates: number[];
  firstNumber: string;
  lastNumber: string;
};

const MAX_LISTED_GAPS = 50;

/** Gapless check for every series and year. Looks at all documents ever issued in that year, whatever the filter. */
export function seriesChecks(documents: FinanceTaxDocument[]): SeriesCheck[] {
  const groups = new Map<string, FinanceTaxDocument[]>();
  for (const doc of documents) groups.set(`${doc.series}|${doc.financialYear}`, [...(groups.get(`${doc.series}|${doc.financialYear}`) ?? []), doc]);
  return [...groups.values()]
    .map((docs) => {
      const sorted = [...docs].sort((a, b) => a.sequence - b.sequence);
      const seen = new Map<number, number>();
      for (const doc of sorted) seen.set(doc.sequence, (seen.get(doc.sequence) ?? 0) + 1);
      const last = sorted.at(-1)!.sequence;
      const gaps: number[] = [];
      for (let n = 1; n <= last && gaps.length < MAX_LISTED_GAPS; n += 1) if (!seen.has(n)) gaps.push(n);
      return {
        series: sorted[0].series,
        financialYear: sorted[0].financialYear,
        kinds: [...new Set(sorted.map((doc) => doc.kind))],
        first: sorted[0].sequence,
        last,
        issued: sorted.length,
        cancelled: sorted.filter((doc) => doc.cancelledAt).length,
        gaps,
        duplicates: [...seen].filter(([, count]) => count > 1).map(([n]) => n),
        firstNumber: sorted[0].number,
        lastNumber: sorted.at(-1)!.number,
      };
    })
    .sort((a, b) => b.financialYear.localeCompare(a.financialYear) || a.series.localeCompare(b.series));
}

/** Documents issued in the window, newest first. */
export function documentsIn(documents: FinanceTaxDocument[], window: Window): FinanceTaxDocument[] {
  return documents.filter((doc) => doc.issuedAt >= window.from && doc.issuedAt < window.to).sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime());
}

/** GSTR-1 Table 13 "nature of document" for each kind we issue. */
const TABLE13_NATURE: Record<TaxDocumentKind, string> = {
  TAX_INVOICE: "Invoices for outward supply",
  BILL_OF_SUPPLY: "Invoices for outward supply",
  RECEIPT: "Receipt voucher",
  CREDIT_NOTE: "Credit note",
};

export type Table13Row = { nature: string; series: string; from: string; to: string; total: number; cancelled: number; netIssued: number };

/**
 * GSTR-1 Table 13 for a return period: per nature and series, the first and last number issued in the
 * period, the count, the cancelled count and the net issued.
 */
export function table13(documents: FinanceTaxDocument[], window: Window): Table13Row[] {
  const groups = new Map<string, FinanceTaxDocument[]>();
  for (const doc of documentsIn(documents, window)) {
    const key = `${TABLE13_NATURE[doc.kind]}|${doc.series}|${doc.financialYear}`;
    groups.set(key, [...(groups.get(key) ?? []), doc]);
  }
  return [...groups.entries()]
    .map(([key, docs]) => {
      const sorted = [...docs].sort((a, b) => a.sequence - b.sequence);
      const cancelled = sorted.filter((doc) => doc.cancelledAt).length;
      return { nature: key.split("|")[0], series: sorted[0].series, from: sorted[0].number, to: sorted.at(-1)!.number, total: sorted.length, cancelled, netIssued: sorted.length - cancelled };
    })
    .sort((a, b) => a.nature.localeCompare(b.nature) || a.series.localeCompare(b.series));
}
