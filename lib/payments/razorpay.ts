import "server-only";

import { gatewayRequest, hmacHex, num, safeEqualHex, str, type PaymentGateway } from "./gateway";

const API = "https://api.razorpay.com/v1";
/** Razorpay retries a failed webhook for up to 24 hours; allow a little more. */
const REPLAY_WINDOW_SECONDS = 36 * 3600;

function auth(keyId: string | null, secret: string) {
  if (!keyId) throw new Error("Razorpay needs a key id.");
  return `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}`;
}

function entity(body: Record<string, unknown>, name: string): Record<string, unknown> {
  const payload = (body.payload ?? {}) as Record<string, { entity?: Record<string, unknown> }>;
  return payload[name]?.entity ?? {};
}

/** Razorpay Orders API with Checkout.js on the pay page. Webhooks are signed with the webhook secret. */
function razorpayRefund(refund: Record<string, unknown>) {
  const status = refund.status === "processed" ? "processed" as const : refund.status === "failed" ? "failed" as const : "pending" as const;
  return { gatewayRefundId: str(refund.id) ?? "", status };
}

export const razorpay: PaymentGateway = {
  async createCheckout(credentials, request) {
    const order = await gatewayRequest(`${API}/orders`, {
      method: "POST",
      auth: auth(credentials.keyId, credentials.secret),
      body: JSON.stringify({
        amount: request.amountMinor,
        currency: request.currency,
        receipt: request.paymentId.slice(0, 40),
        notes: { paymentId: request.paymentId, organisationId: request.organisationId, termId: request.termId ?? "" },
      }),
    });
    const orderId = str(order.id);
    if (!orderId) throw new Error("Razorpay did not return an order.");
    return { kind: "razorpay", orderId, keyId: credentials.keyId! };
  },

  verifyWebhook(credentials, rawBody, headers, now = new Date()) {
    const signature = headers.get("x-razorpay-signature") ?? "";
    if (!credentials.webhookSecret || !signature) return false;
    if (!safeEqualHex(signature, hmacHex(credentials.webhookSecret, rawBody))) return false;
    // Razorpay signs no timestamp header; refuse signed bodies older than its retry window so a captured
    // request can't be replayed later.
    try {
      const created = num((JSON.parse(rawBody) as Record<string, unknown>).created_at);
      return created > 0 && now.getTime() / 1000 - created < REPLAY_WINDOW_SECONDS;
    } catch {
      return false;
    }
  },

  parseEvent(rawBody, headers) {
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    // The event id header isn't covered by the signature, so de-duplication keys on the signed body only:
    // the event, its entity and when Razorpay created it. Refund events carry the payment too, so they key on
    // the refund first: two partial refunds of one payment in the same second are different events.
    void headers;
    const [first, second] = String(body.event).startsWith("refund.") ? ["refund", "payment"] : ["payment", "refund"];
    const eventId = `${str(body.event)}:${str(entity(body, first).id) ?? str(entity(body, second).id) ?? ""}:${num(body.created_at)}`;
    switch (body.event) {
      case "payment.captured": {
        const payment = entity(body, "payment");
        const notes = (payment.notes ?? {}) as Record<string, unknown>;
        return { type: "captured", eventId, orderId: str(payment.order_id), paymentId: str(notes.paymentId), gatewayPaymentId: str(payment.id), amountMinor: num(payment.amount), currency: str(payment.currency) ?? "", method: str(payment.method) };
      }
      // One order takes several attempts, and a member can retry in the same Checkout after a failure, so a
      // failed attempt never closes ours: it stays open until a capture or the reconcile job's week runs out.
      case "payment.failed":
        return { type: "ignored", eventId };
      case "refund.processed": {
        const refund = entity(body, "refund");
        const notes = (refund.notes ?? {}) as Record<string, unknown>;
        return { type: "refund-processed", eventId, gatewayRefundId: str(refund.id) ?? "", refundId: str(notes.refundId), amountMinor: num(refund.amount) };
      }
      case "refund.failed": {
        const refund = entity(body, "refund");
        const notes = (refund.notes ?? {}) as Record<string, unknown>;
        return { type: "refund-failed", eventId, gatewayRefundId: str(refund.id) ?? "", refundId: str(notes.refundId), reason: "The refund failed at Razorpay" };
      }
      default:
        return { type: "ignored", eventId };
    }
  },

  async fetchPayment(credentials, orderId) {
    const result = await gatewayRequest(`${API}/orders/${encodeURIComponent(orderId)}/payments`, { method: "GET", auth: auth(credentials.keyId, credentials.secret) });
    const items = Array.isArray(result.items) ? (result.items as Array<Record<string, unknown>>) : [];
    const captured = items.find((item) => item.status === "captured");
    if (captured) return { status: "paid", gatewayPaymentId: str(captured.id), amountMinor: num(captured.amount), currency: str(captured.currency) ?? "", method: str(captured.method) };
    // Failed attempts don't close the order (the member may still retry it), so it stays pending.
    return { status: "pending" };
  },

  async refund(credentials, args) {
    const refund = await gatewayRequest(`${API}/payments/${encodeURIComponent(args.gatewayPaymentId)}/refund`, {
      method: "POST",
      auth: auth(credentials.keyId, credentials.secret),
      body: JSON.stringify({ amount: args.amountMinor, notes: { refundId: args.refundId } }),
    });
    return razorpayRefund(refund);
  },

  async fetchRefund(credentials, args) {
    const key = auth(credentials.keyId, credentials.secret);
    if (args.gatewayRefundId) return razorpayRefund(await gatewayRequest(`${API}/refunds/${encodeURIComponent(args.gatewayRefundId)}`, { method: "GET", auth: key }));
    const list = await gatewayRequest(`${API}/payments/${encodeURIComponent(args.gatewayPaymentId)}/refunds?count=100`, { method: "GET", auth: key });
    const items = Array.isArray(list.items) ? (list.items as Array<Record<string, unknown>>) : [];
    const match = items.find((item) => ((item.notes ?? {}) as Record<string, unknown>).refundId === args.refundId);
    return match ? razorpayRefund(match) : null;
  },

  async testConnection(credentials) {
    try {
      await gatewayRequest(`${API}/orders?count=1`, { method: "GET", auth: auth(credentials.keyId, credentials.secret) });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Razorpay rejected the keys." };
    }
  },
};

/** Checkout.js hands back this signature; it proves the payment belongs to our order. */
export function verifyCheckoutSignature(secret: string, orderId: string, gatewayPaymentId: string, signature: string) {
  return safeEqualHex(signature, hmacHex(secret, `${orderId}|${gatewayPaymentId}`));
}
