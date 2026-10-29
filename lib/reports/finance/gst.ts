/**
 * B7 GST summary in GSTR-1 layout, GSTR-3B liability, and the SIMPLE-tax summary. Pure, INR only for GST.
 * Table numbers follow the GSTR-1 / GSTR-3B forms (May 2025 layout: Table 12 split B2B/B2C, Table 13
 * mandatory). Definitions and sources: docs/REPORTS.md "GST". Always confirm a return with a CA.
 */
import { bucketIndex, type Bucket } from "../period";
import type { FinanceRefund, FinanceTaxDocument } from "./types";
import type { Window } from "./revenue";

/** Rule 59(4) as amended by Notification 12/2024-CT (from 1 Aug 2024): B2C large is an inter-state invoice over ₹1 lakh. */
export const B2CL_THRESHOLD_MINOR = 100_000_00;

export type TaxAmounts = { taxable: number; igst: number; cgst: number; sgst: number };
const zero = (): TaxAmounts => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0 });
const add = (into: TaxAmounts, doc: FinanceTaxDocument, sign: 1 | -1) => {
  into.taxable += sign * doc.taxableMinor;
  into.igst += sign * doc.igstMinor;
  into.cgst += sign * doc.cgstMinor;
  into.sgst += sign * doc.sgstMinor;
};

export type InvoiceRow = TaxAmounts & { number: string; issuedAt: Date; gstin: string | null; value: number; placeOfSupply: string | null; rateBps: number };
export type B2csRow = TaxAmounts & { placeOfSupply: string; rateBps: number; supplyType: "INTER" | "INTRA" };
export type HsnRow = TaxAmounts & { sac: string; rateBps: number; uqc: "NA"; quantity: 0 };
export type CreditNoteRow = TaxAmounts & { number: string; issuedAt: Date; gstin: string | null; againstNumber: string | null; value: number; placeOfSupply: string | null; rateBps: number };

export type Gstr1 = {
  b2b: InvoiceRow[];
  b2cl: InvoiceRow[];
  b2cs: B2csRow[];
  nilExempt: { inter: number; intra: number };
  cdnr: CreditNoteRow[];
  cdnur: CreditNoteRow[];
  hsnB2b: HsnRow[];
  hsnB2c: HsnRow[];
  totals: TaxAmounts;
};

export function isInterState(doc: Pick<FinanceTaxDocument, "igstMinor" | "placeOfSupply">, supplierState: string | null): boolean {
  if (doc.igstMinor > 0) return true;
  return Boolean(doc.placeOfSupply && supplierState && doc.placeOfSupply !== supplierState);
}

function live(documents: FinanceTaxDocument[], window: Window) {
  return documents.filter((doc) => doc.currency === "INR" && !doc.cancelledAt && doc.issuedAt >= window.from && doc.issuedAt < window.to);
}

const invoiceRow = (doc: FinanceTaxDocument): InvoiceRow => ({ number: doc.number, issuedAt: doc.issuedAt, gstin: doc.recipientGstin, value: doc.totalMinor, placeOfSupply: doc.placeOfSupply, rateBps: doc.rateBps, taxable: doc.taxableMinor, igst: doc.igstMinor, cgst: doc.cgstMinor, sgst: doc.sgstMinor });

/** GSTR-1 for one return period (normally a month). Credit notes against B2C small invoices are netted into Table 7. */
export function gstr1(documents: FinanceTaxDocument[], refunds: FinanceRefund[], window: Window, supplierState: string | null): Gstr1 {
  const docs = live(documents, window);
  const originals = originalDocuments(documents);
  const invoiceForPayment = new Map([...originals].filter(([, doc]) => doc.kind === "TAX_INVOICE"));
  const refundPayment = new Map(refunds.map((refund) => [refund.id, refund.paymentId]));
  const isB2cl = (doc: FinanceTaxDocument) => !doc.recipientGstin && isInterState(doc, supplierState) && doc.totalMinor > B2CL_THRESHOLD_MINOR;
  const result: Gstr1 = { b2b: [], b2cl: [], b2cs: [], nilExempt: { inter: 0, intra: 0 }, cdnr: [], cdnur: [], hsnB2b: [], hsnB2c: [], totals: zero() };
  const b2cs = new Map<string, B2csRow>();
  const hsn = { b2b: new Map<string, HsnRow>(), b2c: new Map<string, HsnRow>() };
  const addHsn = (doc: FinanceTaxDocument, b2b: boolean, sign: 1 | -1) => {
    const map = b2b ? hsn.b2b : hsn.b2c;
    const key = `${doc.sac}|${doc.rateBps}`;
    const row = map.get(key) ?? { sac: doc.sac, rateBps: doc.rateBps, uqc: "NA" as const, quantity: 0 as const, ...zero() };
    add(row, doc, sign);
    map.set(key, row);
  };
  const addB2cs = (doc: FinanceTaxDocument, sign: 1 | -1) => {
    const pos = doc.placeOfSupply ?? supplierState ?? "NA";
    const supplyType = isInterState(doc, supplierState) ? "INTER" : "INTRA";
    const key = `${pos}|${doc.rateBps}|${supplyType}`;
    const row = b2cs.get(key) ?? { placeOfSupply: pos, rateBps: doc.rateBps, supplyType, ...zero() };
    add(row, doc, sign);
    b2cs.set(key, row);
  };
  for (const doc of docs) {
    if (doc.kind === "BILL_OF_SUPPLY") {
      if (isInterState(doc, supplierState)) result.nilExempt.inter += doc.taxableMinor;
      else result.nilExempt.intra += doc.taxableMinor;
      continue;
    }
    if (doc.kind === "TAX_INVOICE") {
      add(result.totals, doc, 1);
      addHsn(doc, Boolean(doc.recipientGstin), 1);
      if (doc.recipientGstin) result.b2b.push(invoiceRow(doc));
      else if (isB2cl(doc)) result.b2cl.push(invoiceRow(doc));
      else addB2cs(doc, 1);
      continue;
    }
    if (doc.kind === "CREDIT_NOTE") {
      const paymentId = doc.paymentId ?? (doc.refundId ? refundPayment.get(doc.refundId) : undefined);
      const against = paymentId ? originals.get(paymentId) : undefined;
      // A credit note reverses what its original declared: an exempt supply reduces nil/exempt, and a plain
      // receipt (outside GST) appears nowhere.
      if (against?.kind === "BILL_OF_SUPPLY") {
        if (isInterState(against, supplierState)) result.nilExempt.inter -= doc.taxableMinor;
        else result.nilExempt.intra -= doc.taxableMinor;
        continue;
      }
      if (against && against.kind !== "TAX_INVOICE") continue;
      add(result.totals, doc, -1);
      const original = paymentId ? invoiceForPayment.get(paymentId) : undefined;
      const b2b = Boolean(doc.recipientGstin ?? original?.recipientGstin);
      addHsn(doc, b2b, -1);
      const row: CreditNoteRow = { ...invoiceRow(doc), gstin: doc.recipientGstin ?? original?.recipientGstin ?? null, againstNumber: original?.number ?? null };
      if (b2b) result.cdnr.push(row);
      else if (original && isB2cl(original)) result.cdnur.push(row);
      else addB2cs(doc, -1);
    }
  }
  result.b2cs = [...b2cs.values()].sort((a, b) => a.placeOfSupply.localeCompare(b.placeOfSupply) || a.rateBps - b.rateBps);
  result.hsnB2b = [...hsn.b2b.values()];
  result.hsnB2c = [...hsn.b2c.values()];
  return result;
}

type Gstr3b = {
  /** 3.1(a) outward taxable supplies (net of credit notes). */
  outwardTaxable: TaxAmounts;
  /** 3.1(c) nil-rated and exempted (bills of supply). */
  nilExempt: number;
  /** 3.2 inter-state supplies to unregistered persons, by place of supply. */
  interStateUnregistered: Array<{ placeOfSupply: string; taxable: number; igst: number }>;
};

export function gstr3b(documents: FinanceTaxDocument[], refunds: FinanceRefund[], window: Window, supplierState: string | null): Gstr3b {
  const r1 = gstr1(documents, refunds, window, supplierState);
  const byPos = new Map<string, { placeOfSupply: string; taxable: number; igst: number }>();
  const unregistered = [...r1.b2cl.map((row) => ({ pos: row.placeOfSupply ?? "NA", taxable: row.taxable, igst: row.igst })), ...r1.b2cs.filter((row) => row.supplyType === "INTER").map((row) => ({ pos: row.placeOfSupply, taxable: row.taxable, igst: row.igst })), ...r1.cdnur.map((row) => ({ pos: row.placeOfSupply ?? "NA", taxable: -row.taxable, igst: -row.igst }))];
  for (const entry of unregistered) {
    const row = byPos.get(entry.pos) ?? { placeOfSupply: entry.pos, taxable: 0, igst: 0 };
    row.taxable += entry.taxable;
    row.igst += entry.igst;
    byPos.set(entry.pos, row);
  }
  return { outwardTaxable: r1.totals, nilExempt: r1.nilExempt.inter + r1.nilExempt.intra, interStateUnregistered: [...byPos.values()].sort((a, b) => a.placeOfSupply.localeCompare(b.placeOfSupply)) };
}

/** The payment document (receipt, tax invoice or bill of supply) each payment was issued, by payment id. */
function originalDocuments(documents: FinanceTaxDocument[]) {
  return new Map(documents.filter((doc) => doc.kind !== "CREDIT_NOTE" && doc.paymentId).map((doc) => [doc.paymentId!, doc]));
}

/** GSTR-3B 3.1(a) liability per month: what each month's return would show. */
export function monthlyLiability(documents: FinanceTaxDocument[], buckets: Bucket[]): Array<{ key: string; label: string } & TaxAmounts> {
  const rows = buckets.map((bucket) => ({ key: bucket.key, label: bucket.label, ...zero() }));
  const originals = originalDocuments(documents);
  for (const doc of documents) {
    if (doc.currency !== "INR" || doc.cancelledAt || (doc.kind !== "TAX_INVOICE" && doc.kind !== "CREDIT_NOTE")) continue;
    // Only credit notes against tax invoices reduce the tax liability.
    if (doc.kind === "CREDIT_NOTE" && doc.paymentId && originals.get(doc.paymentId)?.kind !== "TAX_INVOICE") continue;
    const index = bucketIndex(buckets, doc.issuedAt);
    if (index >= 0) add(rows[index], doc, doc.kind === "CREDIT_NOTE" ? -1 : 1);
  }
  return rows;
}

/** SIMPLE-mode tax (VAT and the like): per currency and rate, taxable value and tax, net of credit notes. */
export function simpleTaxSummary(documents: FinanceTaxDocument[], window: Window, primary?: string) {
  const rows = new Map<string, { currency: string; rateBps: number; taxable: number; tax: number; documents: number }>();
  for (const doc of documents) {
    if (doc.cancelledAt || doc.otherTaxMinor === 0 || doc.issuedAt < window.from || doc.issuedAt >= window.to) continue;
    const sign = doc.kind === "CREDIT_NOTE" ? -1 : 1;
    const key = `${doc.currency}|${doc.rateBps}`;
    const row = rows.get(key) ?? { currency: doc.currency, rateBps: doc.rateBps, taxable: 0, tax: 0, documents: 0 };
    row.taxable += sign * doc.taxableMinor;
    row.tax += sign * doc.otherTaxMinor;
    row.documents += 1;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => (a.currency === primary ? -1 : b.currency === primary ? 1 : a.currency.localeCompare(b.currency)) || a.rateBps - b.rateBps);
}
