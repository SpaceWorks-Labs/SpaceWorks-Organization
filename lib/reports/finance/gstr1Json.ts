import { gstStateCode } from "@/lib/indianStates";
import type { Table13Row } from "./documents";
import type { CreditNoteRow, Gstr1, HsnRow, InvoiceRow } from "./gst";

/**
 * GSTR-1 as JSON in the layout of the GST portal's offline tool 3.2.4 (sections b2b, b2cl, b2cs, cdnr,
 * cdnur, nil, doc_issue and hsn) with its version and hash envelope; valid against GSTN's "Save GSTR1"
 * schema v4.1, the shape that tool writes (checked October 2026). Amounts are rupees with two decimals,
 * dates dd-mm-yyyy, places of supply the two-digit GST state codes. Validate in the current offline tool
 * before uploading: the portal revises the schema from time to time. docs/REPORTS.md describes each section.
 */

const rupees = (minor: number) => Math.round(minor) / 100;
const rate = (rateBps: number) => rateBps / 100;

export function gstDate(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone }).formatToParts(value);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("day")}-${pick("month")}-${pick("year")}`;
}

/** "042026" for April 2026, from the first day of the return period. */
export function gstPeriod(firstDay: { year: number; month: number }) {
  return `${String(firstDay.month).padStart(2, "0")}${firstDay.year}`;
}

const pos = (code: string | null, supplierState: string | null) => gstStateCode(code ?? supplierState) ?? "";

function item(row: { rateBps: number; taxable: number; igst: number; cgst: number; sgst: number }, inter: boolean) {
  const det = { txval: rupees(row.taxable), rt: rate(row.rateBps), ...(inter ? { iamt: rupees(row.igst) } : { camt: rupees(row.cgst), samt: rupees(row.sgst) }), csamt: 0 };
  return { num: row.rateBps + 1, itm_det: det };
}

function invoice(row: InvoiceRow, supplierState: string | null, timeZone: string, b2b: boolean) {
  const inter = row.igst > 0;
  return {
    inum: row.number,
    idt: gstDate(row.issuedAt, timeZone),
    val: rupees(row.value),
    // B2CL carries the place of supply on its group, not on each invoice.
    ...(b2b ? { pos: pos(row.placeOfSupply, supplierState), rchrg: "N", inv_typ: "R" } : {}),
    itms: [item(row, inter)],
  };
}

function note(row: CreditNoteRow, supplierState: string | null, timeZone: string) {
  return {
    ntty: "C",
    nt_num: row.number,
    nt_dt: gstDate(row.issuedAt, timeZone),
    val: rupees(row.value),
    pos: pos(row.placeOfSupply, supplierState),
    itms: [item(row, row.igst > 0)],
  };
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const map = new Map<string, T[]>();
  for (const row of rows) map.set(key(row), [...(map.get(key(row)) ?? []), row]);
  return [...map.entries()];
}

const hsn = (rows: HsnRow[]) =>
  rows.map((row, index) => ({ num: index + 1, hsn_sc: row.sac, desc: "Membership services", uqc: "NA", qty: 0, rt: rate(row.rateBps), txval: rupees(row.taxable), iamt: rupees(row.igst), camt: rupees(row.cgst), samt: rupees(row.sgst), csamt: 0 }));

/** Table 13 codes fixed by the portal. Membership receipts outside GST are not GST documents, so they stay out. */
const DOC_NUM: Record<string, number> = { "Invoices for outward supply": 1, "Credit note": 5 };

function docIssue(rows: Table13Row[]) {
  const det = new Map<number, Table13Row[]>();
  for (const row of rows) if (DOC_NUM[row.nature]) det.set(DOC_NUM[row.nature], [...(det.get(DOC_NUM[row.nature]) ?? []), row]);
  return {
    doc_det: [...det.entries()]
      .sort(([a], [b]) => a - b)
      .map(([doc_num, docs]) => ({ doc_num, docs: docs.map((row, index) => ({ num: index + 1, from: row.from, to: row.to, totnum: row.total, cancel: row.cancelled, net_issue: row.netIssued })) })),
  };
}

const GSTR1_OFFLINE_VERSION = "GST3.2.4";

export function gstr1Json(report: Gstr1, args: { gstin: string; period: string; supplierState: string | null; timeZone: string; documents: Table13Row[] }) {
  const { supplierState, timeZone } = args;
  const docs = docIssue(args.documents);
  // The offline tool's key order: doc_issue, only when there is something to report, comes before hsn.
  return {
    gstin: args.gstin,
    fp: args.period,
    version: GSTR1_OFFLINE_VERSION,
    hash: "hash",
    b2b: groupBy(report.b2b, (row) => row.gstin ?? "").map(([ctin, rows]) => ({ ctin, inv: rows.map((row) => invoice(row, supplierState, timeZone, true)) })),
    b2cl: groupBy(report.b2cl, (row) => pos(row.placeOfSupply, supplierState)).map(([place, rows]) => ({ pos: place, inv: rows.map((row) => invoice(row, supplierState, timeZone, false)) })),
    b2cs: report.b2cs.map((row) => ({ sply_ty: row.supplyType, pos: pos(row.placeOfSupply, supplierState), typ: "OE", rt: rate(row.rateBps), txval: rupees(row.taxable), ...(row.supplyType === "INTER" ? { iamt: rupees(row.igst) } : { camt: rupees(row.cgst), samt: rupees(row.sgst) }), csamt: 0 })),
    cdnr: groupBy(report.cdnr, (row) => row.gstin ?? "").map(([ctin, rows]) => ({ ctin, nt: rows.map((row) => ({ ...note(row, supplierState, timeZone), rchrg: "N", inv_typ: "R" })) })),
    cdnur: report.cdnur.map((row) => ({ typ: "B2CL", ...note(row, supplierState, timeZone) })),
    nil: { inv: [{ sply_ty: "INTRB2C", expt_amt: rupees(report.nilExempt.inter), nil_amt: 0, ngsup_amt: 0 }, { sply_ty: "INTRAB2C", expt_amt: rupees(report.nilExempt.intra), nil_amt: 0, ngsup_amt: 0 }] },
    ...(docs.doc_det.length ? { doc_issue: docs } : {}),
    hsn: { hsn_b2b: hsn(report.hsnB2b), hsn_b2c: hsn(report.hsnB2c) },
  };
}
