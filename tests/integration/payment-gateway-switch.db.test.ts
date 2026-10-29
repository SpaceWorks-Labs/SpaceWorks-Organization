import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (mocks.userId ? { user: { id: mocks.userId } } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { createTermPayment } from "@/lib/payments/charges";
import { ensurePaymentSettings, savePaymentKeys } from "@/lib/payments/config";
import { savePaymentGateway } from "@/app/actions/payment-settings";
import { addStaff } from "../helpers/staff";
import { at, createPaymentsOrg, ensurePaymentKey, removePaymentsOrg, suffix, unpaidTerm } from "./payments-helpers";

ensurePaymentKey();

type Ctx = Awaited<ReturnType<typeof createPaymentsOrg>>;
let org: Ctx["org"];
let plan: Ctx["plan"];
let ownerId: string;
const now = at("2026-07-01T06:00:00Z");

const toStripe = () => savePaymentGateway({ organisationSlug: org.slug, provider: "STRIPE", secret: "sk_test_switch", webhookSecret: "whsec_switch" });
const provider = async () => (await ensurePaymentSettings(org.id)).provider;

beforeAll(async () => {
  ({ org, plan } = await createPaymentsOrg());
  await savePaymentKeys(org.id, { provider: "RAZORPAY", keyId: "rzp_test_key", secret: "secret_key", webhookSecret: "hook_secret", testMode: true });
  ownerId = (await prisma.user.create({ data: { email: `switch-owner-${suffix}@example.test`, name: "Owner", emailVerified: new Date(), mfaEnabledAt: new Date() } })).id;
  await addStaff(org.id, ownerId, "OWNER");
  mocks.userId = ownerId;
});

afterAll(async () => {
  if (org) await removePaymentsOrg(org.id, ownerId ? [ownerId] : []);
  await prisma.$disconnect();
});

describe.sequential("switching the payment gateway", () => {
  it("refuses to switch while the current gateway has an attempt in progress, but still saves its keys", async () => {
    const term = await unpaidTerm(org, plan, "switcher", now);
    const payment = await prisma.$transaction((tx) => createTermPayment(tx, { org, termId: term.id, provider: "RAZORPAY", status: "PENDING", now }));
    await prisma.payment.update({ where: { id: payment.id }, data: { gatewayOrderId: `order_${payment.id.slice(-8)}` } });

    expect(await toStripe()).toEqual({ ok: false, error: "1 online payment is still in progress with the current gateway. Switch once it finishes or is cancelled on the Payments page." });
    expect(await savePaymentGateway({ organisationSlug: org.slug, provider: "NONE" })).toMatchObject({ ok: false });
    expect(await provider()).toBe("RAZORPAY");
    expect(await savePaymentGateway({ organisationSlug: org.slug, provider: "RAZORPAY", keyId: "rzp_test_other" })).toEqual({ ok: true });

    // Older than the week the reconcile job keeps an attempt open: it no longer holds the gateway.
    await prisma.payment.update({ where: { id: payment.id }, data: { createdAt: new Date(Date.now() - 8 * 86_400_000) } });
    expect(await toStripe()).toEqual({ ok: true });
    expect(await provider()).toBe("STRIPE");
  });

  it("lets the switch through once the open attempt is cancelled", async () => {
    const term = await unpaidTerm(org, plan, "closer", now);
    const payment = await prisma.$transaction((tx) => createTermPayment(tx, { org, termId: term.id, provider: "STRIPE", status: "PENDING", now }));
    expect(await savePaymentGateway({ organisationSlug: org.slug, provider: "RAZORPAY", keyId: "rzp_test_key", secret: "secret_key" })).toMatchObject({ ok: false });
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "CANCELLED" } });
    expect(await savePaymentGateway({ organisationSlug: org.slug, provider: "RAZORPAY", keyId: "rzp_test_key", secret: "secret_key" })).toEqual({ ok: true });
    expect(await provider()).toBe("RAZORPAY");
  });
});
