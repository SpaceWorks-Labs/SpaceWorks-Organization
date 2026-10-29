import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { at, createPaymentsOrg, ensurePaymentKey, people, removePaymentsOrg, unpaidTerm } from "./payments-helpers";

ensurePaymentKey();

const { prisma } = await import("@/lib/db");
const { createTermPayment } = await import("@/lib/payments/charges");
const { savePaymentKeys, ensurePaymentSettings } = await import("@/lib/payments/config");
const { handleWebhook } = await import("@/lib/payments/webhooks");
const { releaseHeldDocument } = await import("@/lib/payments/settle");
const { reconcileGatewayPayments } = await import("@/lib/payments/reconcile");

type Ctx = Awaited<ReturnType<typeof createPaymentsOrg>>;
let org: Ctx["org"];
let plan: Ctx["plan"];
let code: string;
let reviewer: { id: string };
const now = at("2026-07-01T06:00:00Z");

const sign = (body: string) => crypto.createHmac("sha256", "hook_secret").update(body).digest("hex");
const captured = (paymentId: string, orderId: string, amount: number) =>
  JSON.stringify({ created_at: Math.floor(Date.now() / 1000), event: "payment.captured", payload: { payment: { entity: { id: `pay_${paymentId.slice(-6)}`, order_id: orderId, amount, currency: "INR", method: "upi", notes: { paymentId } } } } });
const deliver = (body: string, eventId: string, signature = sign(body)) =>
  handleWebhook("RAZORPAY", code, body, new Headers({ "x-razorpay-signature": signature, "x-razorpay-event-id": eventId }));

async function gatewayPayment(name: string) {
  const term = await unpaidTerm(org, plan, name, now);
  const payment = await prisma.$transaction((tx) => createTermPayment(tx, { org, termId: term.id, provider: "RAZORPAY", status: "PENDING", now }));
  const orderId = `order_${payment.id.slice(-8)}`;
  await prisma.payment.update({ where: { id: payment.id }, data: { gatewayOrderId: orderId } });
  return { term, payment, orderId };
}

beforeAll(async () => {
  ({ org, plan } = await createPaymentsOrg());
  await savePaymentKeys(org.id, { provider: "RAZORPAY", keyId: "rzp_test_key", secret: "secret_key", webhookSecret: "hook_secret", testMode: true });
  code = (await ensurePaymentSettings(org.id)).webhookPublicCode;
  [reviewer] = await people(1);
});

afterAll(async () => {
  if (org) await removePaymentsOrg(org.id, reviewer ? [reviewer.id] : []);
  await prisma.$disconnect();
});

describe.sequential("gateway webhooks", () => {
  it("refuses unknown endpoints and bad signatures", async () => {
    const body = captured("x", "order_x", 1);
    expect((await handleWebhook("RAZORPAY", "nope-nope-nope-nope", body, new Headers())).status).toBe(404);
    expect((await handleWebhook("STRIPE", code, body, new Headers())).status).toBe(404);
    expect((await deliver(body, "evt_bad", "0".repeat(64))).status).toBe(401);
  });

  it("settles a capture once, however many times it is delivered", async () => {
    const { term, payment, orderId } = await gatewayPayment("samad");
    const body = captured(payment.id, orderId, 118_000);
    expect(await deliver(body, "evt_1")).toEqual({ status: 200, body: "OK" });
    expect(await deliver(body, "evt_1")).toEqual({ status: 200, body: "Duplicate" });
    const paid = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { documents: true } });
    expect(paid).toMatchObject({ status: "PAID", method: "upi", flaggedAt: null, documentHeld: false });
    expect(paid.documents).toHaveLength(1);
    expect((await prisma.membershipTerm.findUniqueOrThrow({ where: { id: term.id } })).status).toBe("ACTIVE");
    // A different event for the same capture settles nothing twice.
    expect((await deliver(body, "evt_1b")).status).toBe(200);
    expect(await prisma.taxDocument.count({ where: { paymentId: payment.id } })).toBe(1);
  });

  it("records a mismatched amount as paid but holds the document until a manager releases it", async () => {
    const { payment, orderId } = await gatewayPayment("ideologist");
    expect((await deliver(captured(payment.id, orderId, 100_000), "evt_2")).status).toBe(200);
    const held = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(held).toMatchObject({ status: "PAID", documentHeld: true, capturedMinor: 100_000 });
    expect(held.flagReason).toMatch(/differs/);
    expect(await prisma.taxDocument.count({ where: { paymentId: payment.id } })).toBe(0);

    const document = await prisma.$transaction((tx) => releaseHeldDocument(tx, { org, paymentId: payment.id, actorUserId: reviewer.id }));
    expect(document.totalMinor).toBe(100_000);
    expect(document.cgstMinor + document.sgstMinor + document.taxableMinor).toBe(100_000);
  });

  it("receipts and flags a capture that arrives after the membership was already paid", async () => {
    const first = await gatewayPayment("tinker");
    const second = await prisma.$transaction((tx) => createTermPayment(tx, { org, termId: first.term.id, provider: "RAZORPAY", status: "PENDING", now }));
    await prisma.payment.update({ where: { id: second.id }, data: { gatewayOrderId: `order_${second.id.slice(-8)}` } });
    // The first attempt was replaced, so it is CANCELLED; it then captures, and the second captures too.
    expect((await deliver(captured(second.id, `order_${second.id.slice(-8)}`, 118_000), "evt_3")).status).toBe(200);
    expect((await deliver(captured(first.payment.id, first.orderId, 118_000), "evt_4")).status).toBe(200);
    const late = await prisma.payment.findUniqueOrThrow({ where: { id: first.payment.id } });
    expect(late.status).toBe("PAID");
    expect(late.flagReason).toMatch(/already paid/);
    expect(await prisma.taxDocument.count({ where: { paymentId: first.payment.id } })).toBe(1);
  });

  it("receipts and flags money for a membership that can no longer start, instead of failing the webhook", async () => {
    const ended = await prisma.membershipPlan.create({ data: { organisationId: org.id, name: "Season", slug: `season-${org.id.slice(-6)}`, currency: "INR", priceNewMinor: 118_000, joinMode: "OPEN", durationType: "FIXED_END", fixedEndDate: at("2026-07-31T18:30:00Z") } });
    const term = await unpaidTerm(org, ended, "late-season", now);
    const payment = await prisma.$transaction((tx) => createTermPayment(tx, { org, termId: term.id, provider: "RAZORPAY", status: "PENDING", now }));
    await prisma.payment.update({ where: { id: payment.id }, data: { gatewayOrderId: `order_${payment.id.slice(-8)}` } });
    // The capture is only processed after the season has ended.
    const { settlePayment } = await import("@/lib/payments/settle");
    const settled = await prisma.$transaction((tx) => settlePayment(tx, { org, paymentId: payment.id, capture: { gatewayPaymentId: "pay_late", amountMinor: 118_000, currency: "INR", method: "upi" }, now: at("2026-08-02T06:00:00Z") }));
    expect(settled.payment.status).toBe("PAID");
    expect(settled.flagged).toMatch(/couldn't start/);
    expect(await prisma.taxDocument.count({ where: { paymentId: payment.id } })).toBe(1);
  });

  it("keeps a Razorpay attempt open after a failed try, so the retry settles unflagged", async () => {
    const { payment, orderId } = await gatewayPayment("failure");
    const failed = JSON.stringify({ created_at: Math.floor(Date.now() / 1000), event: "payment.failed", payload: { payment: { entity: { id: "pay_f", order_id: orderId, notes: { paymentId: payment.id }, error_description: "Bank declined" } } } });
    expect(await deliver(failed, "evt_5")).toEqual({ status: 200, body: "Ignored" });
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("PENDING");
    expect((await deliver(captured(payment.id, orderId, 118_000), "evt_5b")).status).toBe(200);
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).toMatchObject({ status: "PAID", flaggedAt: null, flagReason: null });
    expect(await deliver(JSON.stringify({ created_at: Math.floor(Date.now() / 1000), event: "order.paid" }), "evt_6")).toEqual({ status: 200, body: "Ignored" });
  });

  it("closes an order whose attempts only failed once the reconcile week runs out", async () => {
    const { payment } = await gatewayPayment("abandoned");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [{ id: "pay_x", status: "failed" }] }), { status: 200 })));
    try {
      const { createdAt } = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      await reconcileGatewayPayments(new Date(createdAt.getTime() + 60 * 60_000), true);
      expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("PENDING");
      // Checked longest ago goes first, so this attempt is in the next batch whatever else the database holds.
      await prisma.payment.update({ where: { id: payment.id }, data: { updatedAt: new Date(0) } });
      await reconcileGatewayPayments(new Date(createdAt.getTime() + 8 * 86_400_000), true);
      expect(await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).toMatchObject({ status: "FAILED", note: "Closed: no payment arrived within a week." });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
