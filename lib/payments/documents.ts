import "server-only";

import type { Organisation, Prisma, TaxDocument } from "@prisma/client";
import { financialYearLabel, localDate } from "@/lib/membership/periods";
import { formatDocumentNumber, type DocumentSeries } from "./numbering";
import { creditNoteLines, placeOfSupply, sumSplits, type TaxSnapshot } from "./tax";

type Tx = Prisma.TransactionClient;
type OrgForDocs = Pick<Organisation, "id" | "name" | "timezone" | "financialYearStartMonth" | "addressLine" | "city" | "stateCode" | "postalCode" | "contactEmail" | "locale" | "logoUrl">;

const DOCUMENT_TEMPLATE_VERSION = 1;

/** Everything a document PDF needs, frozen at issue so a re-render years later looks identical. */
export type DocumentSnapshot = {
  kind: TaxDocument["kind"];
  number: string;
  issuedAt: string;
  financialYear: string;
  currency: string;
  locale: string | null;
  timeZone: string;
  issuer: { name: string; legalName: string | null; gstin: string | null; address: string; state: string | null; email: string | null; logoUrl: string | null };
  recipient: { name: string; memberNumber: number; state: string | null; gstin: string | null };
  placeOfSupply: string | null;
  sac: string | null;
  tax: Pick<TaxSnapshot, "mode" | "rateBps" | "inclusive" | "taxName" | "zeroRatedExport" | "lutNumber">;
  lines: Array<{ description: string; amountMinor: number; taxableMinor: number; cgstMinor: number; sgstMinor: number; igstMinor: number; otherTaxMinor: number }>;
  totals: { amountMinor: number; taxableMinor: number; cgstMinor: number; sgstMinor: number; igstMinor: number; otherTaxMinor: number };
  payment: { provider: string; method: string | null; reference: string | null; paidAt: string | null };
  membership: { plan: string; startsAt: string | null; endsAt: string | null } | null;
  original: { number: string; issuedAt: string } | null;
};

/** Next number in a gapless series. Callers hold the payment row lock first (lock order: payment, counter). */
async function allocate(tx: Tx, organisationId: string, series: DocumentSeries, financialYear: string) {
  const [row] = await tx.$queryRaw<Array<{ value: number }>>`
    INSERT INTO "DocumentCounter" ("organisationId", "series", "financialYear", "next") VALUES (${organisationId}, ${series}, ${financialYear}, 2)
    ON CONFLICT ("organisationId", "series", "financialYear") DO UPDATE SET "next" = "DocumentCounter"."next" + 1
    RETURNING "next" - 1 AS value`;
  return Number(row.value);
}

function issuerOf(org: OrgForDocs, snapshot: TaxSnapshot): DocumentSnapshot["issuer"] {
  const address = snapshot.address || [org.addressLine, org.city, org.postalCode].filter(Boolean).join(", ");
  return { name: org.name, legalName: snapshot.legalName, gstin: snapshot.gstin, address, state: snapshot.supplierState ?? org.stateCode, email: org.contactEmail, logoUrl: org.logoUrl };
}

const paymentForDocument = {
  lines: true,
  member: { select: { name: true, memberNumber: true, stateCode: true, gstin: true } },
  term: { select: { startsAt: true, endsAt: true, plan: { select: { name: true } } } },
} satisfies Prisma.PaymentInclude;

/**
 * Issue the receipt, tax invoice or bill of supply for a settled payment. Idempotent per payment.
 * `receivedMinor` re-apportions the lines when a manager accepts a mismatched capture.
 */
export async function issuePaymentDocument(tx: Tx, org: OrgForDocs, paymentId: string, prefix: string, now = new Date(), receivedMinor?: number) {
  const existing = await tx.taxDocument.findFirst({ where: { organisationId: org.id, paymentId, kind: { not: "CREDIT_NOTE" } } });
  if (existing) return existing;
  const payment = await tx.payment.findUniqueOrThrow({ where: { organisationId_id: { organisationId: org.id, id: paymentId } }, include: paymentForDocument });
  const tax = payment.taxSnapshot as unknown as TaxSnapshot;
  const financialYear = financialYearLabel(localDate(now, org.timezone), org.financialYearStartMonth);
  const sequence = await allocate(tx, org.id, "R", financialYear);
  const number = formatDocumentNumber(prefix, "R", financialYear, sequence);
  const lines = receivedMinor === undefined ? payment.lines : creditNoteLines(payment.lines, receivedMinor);
  const totals = sumSplits(lines);
  const pos = placeOfSupply(payment.member.stateCode, tax);
  const snapshot: DocumentSnapshot = {
    kind: tax.documentKind,
    number,
    issuedAt: now.toISOString(),
    financialYear,
    currency: payment.currency,
    locale: org.locale,
    timeZone: org.timezone,
    issuer: issuerOf(org, tax),
    recipient: { name: payment.member.name, memberNumber: payment.member.memberNumber, state: payment.member.stateCode, gstin: payment.member.gstin },
    placeOfSupply: tax.mode === "GST" ? pos : null,
    sac: tax.sac,
    tax: { mode: tax.mode, rateBps: tax.rateBps, inclusive: tax.inclusive, taxName: tax.taxName, zeroRatedExport: tax.zeroRatedExport, lutNumber: tax.lutNumber },
    lines: lines.map(({ description, amountMinor, taxableMinor, cgstMinor, sgstMinor, igstMinor, otherTaxMinor }) => ({ description, amountMinor, taxableMinor, cgstMinor, sgstMinor, igstMinor, otherTaxMinor })),
    totals,
    payment: { provider: payment.provider, method: payment.method, reference: payment.gatewayPaymentId ?? payment.utr ?? payment.reference, paidAt: payment.paidAt?.toISOString() ?? null },
    membership: payment.term ? { plan: payment.term.plan.name, startsAt: payment.term.startsAt?.toISOString() ?? null, endsAt: payment.term.endsAt?.toISOString() ?? null } : null,
    original: null,
  };
  return tx.taxDocument.create({
    data: {
      organisationId: org.id,
      paymentId,
      kind: tax.documentKind,
      series: "R",
      financialYear,
      sequence,
      number,
      currency: payment.currency,
      totalMinor: totals.amountMinor,
      taxableMinor: totals.taxableMinor,
      cgstMinor: totals.cgstMinor,
      sgstMinor: totals.sgstMinor,
      igstMinor: totals.igstMinor,
      otherTaxMinor: totals.otherTaxMinor,
      placeOfSupply: snapshot.placeOfSupply,
      sac: tax.sac,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
      templateVersion: DOCUMENT_TEMPLATE_VERSION,
      issuedAt: now,
    },
  });
}

/** A credit note for a processed refund, apportioning tax pro rata across the original lines. */
export async function issueCreditNote(tx: Tx, org: OrgForDocs, refundId: string, prefix: string, now = new Date()) {
  const existing = await tx.taxDocument.findUnique({ where: { refundId } });
  if (existing) return existing;
  const refund = await tx.refund.findUniqueOrThrow({ where: { organisationId_id: { organisationId: org.id, id: refundId } } });
  const payment = await tx.payment.findUniqueOrThrow({ where: { organisationId_id: { organisationId: org.id, id: refund.paymentId } }, include: { ...paymentForDocument, documents: { where: { kind: { not: "CREDIT_NOTE" } } } } });
  const original = payment.documents[0];
  const tax = payment.taxSnapshot as unknown as TaxSnapshot;
  const earlier = await tx.refund.aggregate({ where: { paymentId: payment.id, status: "PROCESSED", id: { not: refund.id } }, _sum: { amountMinor: true } });
  const lines = creditNoteLines(payment.lines, refund.amountMinor, earlier._sum.amountMinor ?? 0);
  const totals = sumSplits(lines);
  const financialYear = financialYearLabel(localDate(now, org.timezone), org.financialYearStartMonth);
  const sequence = await allocate(tx, org.id, "C", financialYear);
  const number = formatDocumentNumber(prefix, "C", financialYear, sequence);
  const originalSnapshot = original?.snapshot as unknown as DocumentSnapshot | undefined;
  const snapshot: DocumentSnapshot = {
    kind: "CREDIT_NOTE",
    number,
    issuedAt: now.toISOString(),
    financialYear,
    currency: refund.currency,
    locale: org.locale,
    timeZone: org.timezone,
    issuer: originalSnapshot?.issuer ?? issuerOf(org, tax),
    recipient: originalSnapshot?.recipient ?? { name: payment.member.name, memberNumber: payment.member.memberNumber, state: payment.member.stateCode, gstin: payment.member.gstin },
    placeOfSupply: original?.placeOfSupply ?? null,
    sac: tax.sac,
    tax: { mode: tax.mode, rateBps: tax.rateBps, inclusive: tax.inclusive, taxName: tax.taxName, zeroRatedExport: tax.zeroRatedExport, lutNumber: tax.lutNumber },
    lines: lines.map(({ description, amountMinor, taxableMinor, cgstMinor, sgstMinor, igstMinor, otherTaxMinor }) => ({ description, amountMinor, taxableMinor, cgstMinor, sgstMinor, igstMinor, otherTaxMinor })),
    totals,
    payment: { provider: payment.provider, method: payment.method, reference: refund.gatewayRefundId ?? null, paidAt: refund.processedAt?.toISOString() ?? null },
    membership: originalSnapshot?.membership ?? null,
    original: original ? { number: original.number, issuedAt: original.issuedAt.toISOString() } : null,
  };
  return tx.taxDocument.create({
    data: {
      organisationId: org.id,
      paymentId: payment.id,
      refundId,
      kind: "CREDIT_NOTE",
      series: "C",
      financialYear,
      sequence,
      number,
      currency: refund.currency,
      totalMinor: totals.amountMinor,
      taxableMinor: totals.taxableMinor,
      cgstMinor: totals.cgstMinor,
      sgstMinor: totals.sgstMinor,
      igstMinor: totals.igstMinor,
      otherTaxMinor: totals.otherTaxMinor,
      placeOfSupply: snapshot.placeOfSupply,
      sac: tax.sac,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
      templateVersion: DOCUMENT_TEMPLATE_VERSION,
      issuedAt: now,
    },
  });
}
