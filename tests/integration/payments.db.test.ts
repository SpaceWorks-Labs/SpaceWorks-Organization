import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createTermPayment, type OrgForPayments } from "@/lib/payments/charges";
import { cancelPayment, claimOfflinePayment, confirmOfflinePayment, recordOfflinePayment, rejectOfflinePayment, waiveTermFee } from "@/lib/payments/offline";
import { createRefund } from "@/lib/payments/refunds";
import { settlePayment } from "@/lib/payments/settle";
import { at, createPaymentsOrg, people, removePaymentsOrg, unpaidTerm } from "./payments-helpers";

let org: OrgForPayments;
let plan: Awaited<ReturnType<typeof createPaymentsOrg>>["plan"];
let staff: Array<{ id: string }>;
const june = at("2026-06-15T06:00:00Z");

beforeAll(async () => {
  ({ org, plan } = await createPaymentsOrg({ makerChecker: true }));
  staff = await people(2);
});

afterAll(async () => {
  if (org) await removePaymentsOrg(org.id, staff.map((person) => person.id));
  await prisma.$disconnect();
});

const rejectionNotices = (paymentId: string) =>
  prisma.outboxMessage.count({ where: { kind: "payment-notice", payload: { path: ["paymentId"], equals: paymentId }, AND: { payload: { path: ["notice"], equals: "claim-rejected" } } } });

describe.sequential("offline payments", () => {
  it("waits for a second person, then receipts with a GST tax invoice and starts the membership", async () => {
    const term = await unpaidTerm(org, plan, "shaan", june);
    const { payment, settled } = await prisma.$transaction((tx) => recordOfflinePayment(tx, { org, termId: term.id, method: "cash", reference: "Book 4/12", actorUserId: staff[0].id, now: june }));
    expect(settled).toBe(false);
    expect(payment.status).toBe("AWAITING_CONFIRMATION");
    await expect(prisma.$transaction((tx) => confirmOfflinePayment(tx, { org, paymentId: payment.id, actorUserId: staff[0].id, now: june }))).rejects.toThrow(/Someone else/);

    const confirmed = await prisma.$transaction((tx) => confirmOfflinePayment(tx, { org, paymentId: payment.id, actorUserId: staff[1].id, now: june }));
    expect(confirmed).toMatchObject({ status: "PAID", confirmedById: staff[1].id, amountMinor: 118_000 });
    expect((await prisma.membershipTerm.findUniqueOrThrow({ where: { id: term.id } })).status).toBe("ACTIVE");
    const [document] = await prisma.taxDocument.findMany({ where: { paymentId: payment.id } });
    expect(document).toMatchObject({ kind: "TAX_INVOICE", series: "R", financialYear: "2026-27", number: "KUNJ-2627-00001", totalMinor: 118_000, taxableMinor: 100_000, cgstMinor: 9_000, sgstMinor: 9_000, placeOfSupply: "KL", sac: "999599" });
  });

  it("refuses a reused UTR, but takes it again after the first claim is rejected", async () => {
    const term = await unpaidTerm(org, plan, "abhiram", june);
    const other = await unpaidTerm(org, plan, "midlaj", june);
    const claim = await prisma.$transaction((tx) => claimOfflinePayment(tx, { org, termId: term.id, method: "upi", utr: "612345678901", userId: staff[0].id, now: june }));
    expect(claim.status).toBe("AWAITING_CONFIRMATION");
    await expect(prisma.$transaction((tx) => claimOfflinePayment(tx, { org, termId: other.id, method: "upi", utr: "612345678901", userId: staff[0].id, now: june }))).rejects.toThrow(/already been submitted/);
    await expect(prisma.$transaction((tx) => createTermPayment(tx, { org, termId: term.id, provider: "RAZORPAY", status: "PENDING", now: june }))).rejects.toThrow(/waiting for the team/);

    await prisma.$transaction((tx) => rejectOfflinePayment(tx, { org, paymentId: claim.id, actorUserId: staff[1].id, reason: "No such transfer" }));
    expect(await rejectionNotices(claim.id)).toBe(1);
    const again = await prisma.$transaction((tx) => claimOfflinePayment(tx, { org, termId: other.id, method: "upi", utr: "612345678901", userId: staff[0].id, now: june }));
    expect(again.status).toBe("AWAITING_CONFIRMATION");
  });

  it("closes a payment the team recorded without telling the member their claim was turned down", async () => {
    const term = await unpaidTerm(org, plan, "fathima", june);
    const { payment } = await prisma.$transaction((tx) => recordOfflinePayment(tx, { org, termId: term.id, method: "cash", reference: "Book 4/13", actorUserId: staff[0].id, now: june }));
    await prisma.$transaction((tx) => rejectOfflinePayment(tx, { org, paymentId: payment.id, actorUserId: staff[1].id, reason: "Entered against the wrong member" }));
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("FAILED");
    expect(await rejectionNotices(payment.id)).toBe(0);
  });

  it("waives a fee without a document and cancels only open payments", async () => {
    const term = await unpaidTerm(org, plan, "ajzal", june);
    const waived = await prisma.$transaction((tx) => waiveTermFee(tx, { org, termId: term.id, actorUserId: staff[0].id, reason: "Founding member", now: june }));
    expect(waived).toMatchObject({ status: "WAIVED", amountMinor: 118_000 });
    expect(await prisma.taxDocument.count({ where: { paymentId: waived.id } })).toBe(0);
    expect((await prisma.membershipTerm.findUniqueOrThrow({ where: { id: term.id } })).status).toBe("ACTIVE");
    await expect(prisma.$transaction((tx) => cancelPayment(tx, { org, paymentId: waived.id, actorUserId: staff[0].id }))).rejects.toThrow(/Only an open payment/);
  });
});

describe.sequential("refunds and credit notes", () => {
  it("issues a pro-rata credit note and stops at the amount received", async () => {
    const term = await unpaidTerm(org, plan, "anin", june, "TN");
    const { payment } = await prisma.$transaction((tx) => recordOfflinePayment(tx, { org, termId: term.id, method: "upi", utr: "699999999999", actorUserId: staff[0].id, now: june }));
    await prisma.$transaction((tx) => confirmOfflinePayment(tx, { org, paymentId: payment.id, actorUserId: staff[1].id, now: june }));
    const invoice = await prisma.taxDocument.findFirstOrThrow({ where: { paymentId: payment.id, kind: "TAX_INVOICE" } });
    expect(invoice).toMatchObject({ igstMinor: 18_000, cgstMinor: 0, placeOfSupply: "TN" });

    const { refund } = await prisma.$transaction((tx) => createRefund(tx, { org, paymentId: payment.id, amountMinor: 59_000, reason: "Half year", actorUserId: staff[1].id, now: june }));
    expect(refund.status).toBe("PROCESSED");
    const credit = await prisma.taxDocument.findUniqueOrThrow({ where: { refundId: refund.id } });
    expect(credit).toMatchObject({ kind: "CREDIT_NOTE", series: "C", number: "KUNJ-2627-C00001", totalMinor: 59_000, taxableMinor: 50_000, igstMinor: 9_000 });
    await expect(prisma.$transaction((tx) => createRefund(tx, { org, paymentId: payment.id, amountMinor: 59_001, reason: "Too much", actorUserId: staff[1].id }))).rejects.toThrow(/more than is left/);
  });
});

describe.sequential("immutability", () => {
  it("lets a paid payment gain settlement details but never change its amount, and keeps documents", async () => {
    const paid = await prisma.payment.findFirstOrThrow({ where: { organisationId: org.id, status: "PAID" }, include: { documents: true } });
    await prisma.payment.update({ where: { id: paid.id }, data: { settlementId: "setl_1" } });
    await expect(prisma.payment.update({ where: { id: paid.id }, data: { amountMinor: 1 } })).rejects.toThrow();
    await expect(prisma.payment.delete({ where: { id: paid.id } })).rejects.toThrow();
    const document = paid.documents[0];
    await expect(prisma.taxDocument.update({ where: { id: document.id }, data: { number: "X-1" } })).rejects.toThrow();
    await expect(prisma.taxDocument.delete({ where: { id: document.id } })).rejects.toThrow();
    await expect(prisma.paymentLine.updateMany({ where: { paymentId: paid.id }, data: { description: "edited" } })).rejects.toThrow();
  });
});

describe.sequential("document numbering", () => {
  it("allocates gapless numbers under concurrency, including the first documents of a new financial year", async () => {
    for (const when of [june, at("2027-05-01T06:00:00Z")]) {
      const terms = await Promise.all(Array.from({ length: 6 }, (_, index) => unpaidTerm(org, plan, `burst-${when.getUTCFullYear()}-${index}`, when)));
      const payments = await Promise.all(terms.map((term) => prisma.$transaction((tx) => createTermPayment(tx, { org, termId: term.id, provider: "OFFLINE", status: "AWAITING_CONFIRMATION", method: "cash", recordedById: staff[0].id, now: when }))));
      await Promise.all(payments.map((payment) => prisma.$transaction((tx) => settlePayment(tx, { org, paymentId: payment.id, confirmedById: staff[1].id, now: when }))));
      const year = when === june ? "2026-27" : "2027-28";
      const sequences = (await prisma.taxDocument.findMany({ where: { organisationId: org.id, series: "R", financialYear: year }, select: { sequence: true } })).map((doc) => doc.sequence).sort((a, b) => a - b);
      expect(sequences).toEqual(Array.from({ length: sequences.length }, (_, index) => index + 1));
    }
  });
});
