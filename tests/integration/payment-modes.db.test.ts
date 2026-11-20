import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { decideTerm, openTerm, startRenewal, upsertMember } from "@/lib/membership/service";
import { buildPayView } from "@/lib/payments/payView";
import { startCheckout } from "@/lib/payments/checkout";
import { savePaymentKeys } from "@/lib/payments/config";
import { claimOfflinePayment, confirmOfflinePayment } from "@/lib/payments/offline";
import type { OrgForPayments } from "@/lib/payments/charges";
import { at, createPaymentsOrg, ensurePaymentKey, people, removePaymentsOrg, suffix } from "./payments-helpers";

// Payment modes (part C): free plans take no payment, in-hand plans never use the gateway, and money still
// settles only through settlePayment with gapless receipts.
let org: OrgForPayments;
let staffId: string;
let userIds: string[] = [];
const plans: Record<string, Awaited<ReturnType<typeof createPaymentsOrg>>["plan"]> = {};

const base = (slug: string) => ({ organisationId: org.id, name: slug, slug: `${slug}-${suffix}`, currency: "INR", joinMode: "OPEN" as const });
const member = (name: string) => prisma.$transaction((tx) => upsertMember(tx, org.id, { email: `${name}-${suffix}@example.test`, name, stateCode: "KL", source: "MANUAL" }));
const payments = () => prisma.payment.count({ where: { organisationId: org.id } });
const documents = () => prisma.taxDocument.findMany({ where: { organisationId: org.id }, orderBy: { sequence: "asc" }, select: { sequence: true, number: true } });

beforeAll(async () => {
  ensurePaymentKey();
  ({ org } = await createPaymentsOrg());
  const staff = await people(1);
  userIds = staff.map((user) => user.id);
  staffId = staff[0].id;
  plans.free = await prisma.membershipPlan.create({ data: { ...base("free"), paymentMode: "FREE", priceNewMinor: 0, priceRenewalMinor: 0 } });
  // Stored prices on a free plan are never charged.
  plans.freeStale = await prisma.membershipPlan.create({ data: { ...base("stale"), paymentMode: "FREE", priceNewMinor: 50_000, priceRenewalMinor: 50_000 } });
  plans.freeApproval = await prisma.membershipPlan.create({ data: { ...base("freeapp"), paymentMode: "FREE", joinMode: "APPROVAL" } });
  plans.hand = await prisma.membershipPlan.create({ data: { ...base("hand"), paymentMode: "IN_HAND_ONLY", priceNewMinor: 118_000, priceRenewalMinor: 118_000 } });
  plans.online = await prisma.membershipPlan.create({ data: { ...base("online"), paymentMode: "ONLINE_OR_IN_HAND", priceNewMinor: 118_000, priceRenewalMinor: 118_000 } });
});

afterAll(async () => {
  if (org) await removePaymentsOrg(org.id, userIds);
  await prisma.$disconnect();
});

describe.sequential("free plans", () => {
  it("start straight away with no payment and no receipt", async () => {
    const m = await member("freebie");
    const term = await prisma.$transaction((tx) => openTerm(tx, { org, plan: plans.free, memberId: m.id, byManager: false, actorUserId: null, now: at("2026-06-15T06:00:00Z") }));
    expect(term).toMatchObject({ status: "ACTIVE", priceMinor: 0, joiningFeeMinor: 0 });
    const stale = await prisma.$transaction((tx) => openTerm(tx, { org, plan: plans.freeStale, memberId: m.id, byManager: false, actorUserId: null, now: at("2026-06-15T06:00:00Z") }));
    expect(stale).toMatchObject({ status: "ACTIVE", priceMinor: 0 });
    expect(await payments()).toBe(0);
    expect(await documents()).toEqual([]);
    expect(await prisma.termStatusEvent.count({ where: { termId: term.id } })).toBeGreaterThan(0);
  });

  it("wait for approval when the plan needs it, then start with no payment step", async () => {
    const m = await member("applicant");
    const applied = await prisma.$transaction((tx) => openTerm(tx, { org, plan: plans.freeApproval, memberId: m.id, byManager: false, actorUserId: null, now: at("2026-06-15T06:00:00Z") }));
    expect(applied.status).toBe("PENDING_APPROVAL");
    const approved = await prisma.$transaction((tx) => decideTerm(tx, { org, termId: applied.id, action: "approve", actorUserId: staffId, now: at("2026-06-15T07:00:00Z") }));
    expect(approved.status).toBe("ACTIVE");
    expect(await payments()).toBe(0);
    expect((await prisma.termStatusEvent.findMany({ where: { termId: applied.id }, orderBy: { recordedAt: "asc" } })).map((event) => event.to)).toEqual(["PENDING_APPROVAL", "ACTIVE"]);
    expect(await prisma.auditEvent.count({ where: { organisationId: org.id, action: "MEMBERSHIP_APPROVE", targetId: applied.id } })).toBe(1);
  });

  it("renew with no payment and no receipt", async () => {
    const m = await member("renewer");
    await prisma.$transaction((tx) => openTerm(tx, { org, plan: plans.free, memberId: m.id, byManager: false, actorUserId: null, now: at("2026-06-15T06:00:00Z") }));
    const renewal = await prisma.$transaction((tx) => startRenewal(tx, { org, plan: plans.free, memberId: m.id, byManager: false, actorUserId: null, now: at("2027-03-10T06:00:00Z") }));
    expect(renewal).toMatchObject({ kind: "RENEWAL", status: "UPCOMING", priceMinor: 0 });
    expect(await payments()).toBe(0);
    expect(await documents()).toEqual([]);
  });
});

describe.sequential("online or in hand", () => {
  it("falls back to in-hand instructions without a gateway", async () => {
    await prisma.orgPaymentSettings.upsert({ where: { organisationId: org.id }, create: { organisationId: org.id, offlineInstructions: "Pay the treasurer.", webhookPublicCode: `c${suffix}` }, update: { offlineInstructions: "Pay the treasurer." } });
    const m = await member("nogateway");
    const term = await prisma.$transaction((tx) => openTerm(tx, { org, plan: plans.online, memberId: m.id, byManager: true, actorUserId: null, now: at("2026-06-15T06:00:00Z") }));
    const view = await buildPayView(term.id, org.id, {});
    expect(view.online).toBeNull();
    expect(view.offline).toMatchObject({ offlineOnly: true, instructions: "Pay the treasurer." });
    await expect(startCheckout({ organisationId: org.id, termId: term.id, customer: { name: "x", email: "x@example.test" }, returnPath: "/pay/x" })).rejects.toThrow(/isn't set up/);
  });

  it("uses the gateway once the organisation has one, but never for in-hand plans", async () => {
    await savePaymentKeys(org.id, { provider: "RAZORPAY", keyId: "rzp_test_abc", secret: "secret", testMode: true });
    const online = await prisma.$transaction(async (tx) => openTerm(tx, { org, plan: plans.online, memberId: (await upsertMember(tx, org.id, { email: `gw1-${suffix}@example.test`, name: "gw1", source: "MANUAL" })).id, byManager: true, actorUserId: null, now: at("2026-06-15T06:00:00Z") }));
    expect((await buildPayView(online.id, org.id, {})).online).toMatchObject({ provider: "RAZORPAY" });

    const hand = await prisma.$transaction(async (tx) => openTerm(tx, { org, plan: plans.hand, memberId: (await upsertMember(tx, org.id, { email: `gw2-${suffix}@example.test`, name: "gw2", source: "MANUAL" })).id, byManager: true, actorUserId: null, now: at("2026-06-15T06:00:00Z") }));
    const view = await buildPayView(hand.id, org.id, {});
    expect(view.online).toBeNull();
    expect(view.inHandOnly).toBe(true);
    expect(view.offline).toMatchObject({ offlineOnly: true, instructions: "Pay the treasurer." });
    await expect(startCheckout({ organisationId: org.id, termId: hand.id, customer: { name: "x", email: "x@example.test" }, returnPath: "/pay/x" })).rejects.toThrow(/paid in hand/);
  });
});

describe.sequential("in hand only", () => {
  it("settles a member's claim once staff confirm it, with gapless receipts", async () => {
    const numbers: number[] = [];
    for (const name of ["hand1", "hand2"]) {
      const m = await member(name);
      const term = await prisma.$transaction((tx) => openTerm(tx, { org, plan: plans.hand, memberId: m.id, byManager: true, actorUserId: null, now: at("2026-06-15T06:00:00Z") }));
      expect(term.status).toBe("PENDING_PAYMENT");
      const claim = await prisma.$transaction((tx) => claimOfflinePayment(tx, { org, termId: term.id, method: "upi", utr: `UTR${name}${suffix}`, userId: null }));
      expect(claim).toMatchObject({ status: "AWAITING_CONFIRMATION", provider: "OFFLINE", memberClaim: true });
      expect((await prisma.membershipTerm.findUniqueOrThrow({ where: { id: term.id } })).status).toBe("PENDING_PAYMENT");

      const settled = await prisma.$transaction((tx) => confirmOfflinePayment(tx, { org, paymentId: claim.id, actorUserId: staffId, now: at("2026-06-16T06:00:00Z") }));
      expect(settled.status).toBe("PAID");
      expect((await prisma.membershipTerm.findUniqueOrThrow({ where: { id: term.id } })).status).toBe("ACTIVE");
      numbers.push((await documents()).at(-1)!.sequence);
    }
    expect(numbers[1]).toBe(numbers[0] + 1);
    expect(await prisma.termStatusEvent.count({ where: { organisationId: org.id, to: "ACTIVE", cause: "paid" } })).toBeGreaterThanOrEqual(2);
  });
});
