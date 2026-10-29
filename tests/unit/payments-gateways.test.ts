import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { razorpay, verifyCheckoutSignature } = await import("@/lib/payments/razorpay");
const { stripe } = await import("@/lib/payments/stripe");

const hmac = (secret: string, value: string) => crypto.createHmac("sha256", secret).update(value).digest("hex");
const credentials = { keyId: "rzp_test_abc", secret: "secret_key", webhookSecret: "hook_secret", testMode: true };

afterEach(() => vi.unstubAllGlobals());

describe("Razorpay", () => {
  const created = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ event: "payment.captured", created_at: created, payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 118000, currency: "INR", method: "upi", notes: { paymentId: "p1" } } } } });

  it("accepts only webhooks signed with the webhook secret", () => {
    expect(razorpay.verifyWebhook(credentials, body, new Headers({ "x-razorpay-signature": hmac("hook_secret", body) }))).toBe(true);
    expect(razorpay.verifyWebhook(credentials, body, new Headers({ "x-razorpay-signature": hmac("other", body) }))).toBe(false);
    expect(razorpay.verifyWebhook(credentials, `${body} `, new Headers({ "x-razorpay-signature": hmac("hook_secret", body) }))).toBe(false);
    expect(razorpay.verifyWebhook({ ...credentials, webhookSecret: null }, body, new Headers({ "x-razorpay-signature": hmac("hook_secret", body) }))).toBe(false);
  });

  it("refuses a correctly signed body replayed after the retry window", () => {
    const later = new Date((created + 40 * 3600) * 1000);
    expect(razorpay.verifyWebhook(credentials, body, new Headers({ "x-razorpay-signature": hmac("hook_secret", body) }), later)).toBe(false);
  });

  it("reads a capture with our payment id, keyed on the signed body rather than the unsigned header", () => {
    expect(razorpay.parseEvent(body, new Headers({ "x-razorpay-event-id": "evt_9" }))).toEqual({ type: "captured", eventId: `payment.captured:pay_1:${created}`, orderId: "order_1", paymentId: "p1", gatewayPaymentId: "pay_1", amountMinor: 118000, currency: "INR", method: "upi" });
  });

  it("carries our refund id through refund events and ignores the rest", () => {
    const refund = JSON.stringify({ event: "refund.processed", payload: { refund: { entity: { id: "rfnd_1", amount: 5000, notes: { refundId: "r1" } } } } });
    expect(razorpay.parseEvent(refund, new Headers({ "x-razorpay-event-id": "e" }))).toMatchObject({ type: "refund-processed", gatewayRefundId: "rfnd_1", refundId: "r1", amountMinor: 5000 });
    expect(razorpay.parseEvent(JSON.stringify({ event: "order.paid", created_at: 5 }), new Headers({ "x-razorpay-event-id": "e2" }))).toEqual({ type: "ignored", eventId: "order.paid::5" });
  });

  it("keys refund events on the refund, so two partial refunds of one payment in the same second both apply", () => {
    const refund = (id: string) => JSON.stringify({ event: "refund.processed", created_at: created, payload: { payment: { entity: { id: "pay_1" } }, refund: { entity: { id, amount: 100, notes: {} } } } });
    expect(razorpay.parseEvent(refund("rfnd_a"), new Headers()).eventId).toBe(`refund.processed:rfnd_a:${created}`);
    expect(razorpay.parseEvent(refund("rfnd_b"), new Headers()).eventId).toBe(`refund.processed:rfnd_b:${created}`);
  });

  it("leaves the attempt open on a failed payment, because the member can retry the same order", () => {
    const failed = JSON.stringify({ event: "payment.failed", created_at: created, payload: { payment: { entity: { id: "pay_f", order_id: "order_1", notes: { paymentId: "p1" }, error_description: "Bank declined" } } } });
    expect(razorpay.parseEvent(failed, new Headers())).toEqual({ type: "ignored", eventId: `payment.failed:pay_f:${created}` });
  });

  it("reads an order whose attempts all failed as still pending, and a later capture as paid", async () => {
    const items: Array<Record<string, unknown>> = [{ id: "pay_f", status: "failed" }];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items }), { status: 200 })));
    expect(await razorpay.fetchPayment(credentials, "order_1")).toEqual({ status: "pending" });
    items.push({ id: "pay_ok", status: "captured", amount: 118000, currency: "INR", method: "upi" });
    expect(await razorpay.fetchPayment(credentials, "order_1")).toEqual({ status: "paid", gatewayPaymentId: "pay_ok", amountMinor: 118000, currency: "INR", method: "upi" });
  });

  it("verifies the Checkout.js signature over order and payment ids", () => {
    expect(verifyCheckoutSignature("secret_key", "order_1", "pay_1", hmac("secret_key", "order_1|pay_1"))).toBe(true);
    expect(verifyCheckoutSignature("secret_key", "order_1", "pay_2", hmac("secret_key", "order_1|pay_1"))).toBe(false);
  });

  it("creates orders with our payment id in the notes", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: "order_42" }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const result = await razorpay.createCheckout(credentials, { paymentId: "p1", organisationId: "o1", termId: "t1", amountMinor: 118000, currency: "INR", description: "Annual", organisationName: "Club", customer: { name: "A", email: "a@example.test" }, successUrl: "https://x/s", cancelUrl: "https://x/c" });
    expect(result).toEqual({ kind: "razorpay", orderId: "order_42", keyId: "rzp_test_abc" });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ amount: 118000, currency: "INR", notes: { paymentId: "p1" } });
  });
});

describe("Stripe", () => {
  const stripeCredentials = { keyId: null, secret: "sk_test_x", webhookSecret: "whsec_test", testMode: true };
  const now = new Date("2026-10-20T10:00:00Z");
  const t = Math.floor(now.getTime() / 1000);
  const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_1", payment_status: "paid", client_reference_id: "p1", payment_intent: "pi_1", amount_total: 2000, currency: "usd" } } });

  it("verifies signatures within the tolerance window only", () => {
    const header = `t=${t},v1=${hmac("whsec_test", `${t}.${body}`)}`;
    expect(stripe.verifyWebhook(stripeCredentials, body, new Headers({ "stripe-signature": header }), now)).toBe(true);
    expect(stripe.verifyWebhook(stripeCredentials, body, new Headers({ "stripe-signature": header }), new Date(now.getTime() + 10 * 60_000))).toBe(false);
    expect(stripe.verifyWebhook(stripeCredentials, body, new Headers({ "stripe-signature": `t=${t},v1=${hmac("other", `${t}.${body}`)}` }), now)).toBe(false);
  });

  it("treats a paid session as a capture and an unpaid one as pending", () => {
    expect(stripe.parseEvent(body, new Headers())).toMatchObject({ type: "captured", eventId: "evt_1", orderId: "cs_1", paymentId: "p1", gatewayPaymentId: "pi_1", amountMinor: 2000, currency: "USD" });
    const unpaid = body.replace('"paid"', '"unpaid"');
    expect(stripe.parseEvent(unpaid, new Headers())).toEqual({ type: "ignored", eventId: "evt_1" });
  });

  it("maps refund states and expiries", () => {
    const refund = (status: string) => JSON.stringify({ id: "evt_r", type: "refund.updated", data: { object: { id: "re_1", status, amount: 500, metadata: { refundId: "r1" } } } });
    expect(stripe.parseEvent(refund("succeeded"), new Headers())).toMatchObject({ type: "refund-processed", refundId: "r1" });
    expect(stripe.parseEvent(refund("failed"), new Headers())).toMatchObject({ type: "refund-failed", refundId: "r1" });
    expect(stripe.parseEvent(refund("pending"), new Headers())).toMatchObject({ type: "ignored" });
    const expired = JSON.stringify({ id: "evt_x", type: "checkout.session.expired", data: { object: { id: "cs_2", client_reference_id: "p2" } } });
    expect(stripe.parseEvent(expired, new Headers())).toMatchObject({ type: "failed", paymentId: "p2", reason: "Checkout expired" });
  });

  it("refuses three-decimal amounts Stripe cannot take", async () => {
    await expect(stripe.createCheckout(stripeCredentials, { paymentId: "p", organisationId: "o", termId: null, amountMinor: 1005, currency: "KWD", description: "x", organisationName: "x", customer: { name: "x", email: "x@example.test" }, successUrl: "https://x", cancelUrl: "https://x" })).rejects.toThrow(/multiples of 10/);
  });
});
