import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (mocks.userId ? { user: { id: mocks.userId } } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { openTerm, upsertMember } from "@/lib/membership/service";
import { ORG_FOR_PAYMENTS, type OrgForPayments } from "@/lib/payments/charges";
import { claimOfflinePayment } from "@/lib/payments/offline";
import { buildPayView } from "@/lib/payments/payView";
import { loadPaymentGuidance } from "@/lib/payments/payGuidance";
import { confirmPayment, recordPayment } from "@/app/actions/payments";
import { recordCollection } from "@/app/actions/collection";
import { setUnitPaymentInstructions } from "@/app/actions/units";
import { loadOrgReportsCash } from "@/lib/views/app__dashboard__orgSlug__reports__cash__page";
import { loadCollectionSheet } from "@/lib/views/app__dashboard__orgSlug__payments__collect__page";
import { addStaff } from "../helpers/staff";
import { removePaymentsOrg } from "./payments-helpers";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
let org: OrgForPayments;
let planId: string;
const units: Record<string, { id: string; path: string }> = {};
const users: Record<string, string> = {};
const terms: Record<string, string> = {};
const today = () => new Date().toISOString().slice(0, 10);

async function staffUser(name: string) {
  const user = await prisma.user.create({ data: { email: `${name}-${suffix}@example.test`, name, emailVerified: new Date(), mfaEnabledAt: new Date() } });
  users[name] = user.id;
  return user.id;
}

async function unit(name: string, code: string, parent?: { id: string; path: string }) {
  const created = await prisma.orgUnit.create({ data: { organisationId: org.id, parentId: parent?.id ?? null, name, slug: `${code.toLowerCase()}-${suffix}`, code, level: parent ? 1 : 0, path: "pending" } });
  const path = parent ? `${parent.path}/${created.id}` : created.id;
  await prisma.orgUnit.update({ where: { id: created.id }, data: { path } });
  return { id: created.id, path };
}

/** A member of a unit with an unpaid membership (opened by a manager, so it waits for payment). */
async function unpaid(key: string, unitId: string) {
  const term = await prisma.$transaction(async (tx) => {
    const plan = await tx.membershipPlan.findUniqueOrThrow({ where: { id: planId } });
    const member = await upsertMember(tx, org.id, { email: `${key}-${suffix}@example.test`, name: `Member ${key}`, stateCode: "KL", unitId, source: "MANUAL" });
    return openTerm(tx, { org, plan, memberId: member.id, byManager: true, actorUserId: null });
  });
  terms[key] = term.id;
  return term.id;
}

const params = () => ({ params: Promise.resolve({ orgSlug: org.slug }) });

beforeAll(async () => {
  const created = await prisma.organisation.create({ data: { name: "Example Network", slug: `example-network-${suffix}`, status: "ACTIVE", stateCode: "KL", unitLevels: ["Area", "Unit"] } });
  org = await prisma.organisation.findUniqueOrThrow({ where: { id: created.id }, select: ORG_FOR_PAYMENTS });
  planId = (await prisma.membershipPlan.create({ data: { organisationId: org.id, name: "Annual", slug: `annual-${suffix}`, currency: "INR", priceNewMinor: 50_000, priceRenewalMinor: 50_000, joinMode: "OPEN" } })).id;
  units.north = await unit("North", "NTH");
  units.north1 = await unit("North 1", "NTH1", units.north);
  units.south = await unit("South", "STH");
  await addStaff(org.id, await staffUser("owner"), "OWNER");
  await addStaff(org.id, await staffUser("secretary"), "TREASURER", units.north.id);
  await addStaff(org.id, await staffUser("checker"), "TREASURER");
  for (const key of ["n1", "n2", "n3", "n4"]) await unpaid(key, units.north1.id);
  await unpaid("s1", units.south.id);
});

afterAll(async () => {
  if (org) {
    await prisma.orgUnit.updateMany({ where: { organisationId: org.id }, data: { parentId: null } });
    await removePaymentsOrg(org.id, Object.values(users));
  }
  await prisma.$disconnect();
});

describe.sequential("offline fees through the hierarchy", () => {
  it("shows the nearest unit's instructions, worded for a unit when there is no gateway", async () => {
    mocks.userId = users.secretary;
    expect(await setUnitPaymentInstructions({ organisationSlug: org.slug, unitId: units.north.id, paymentInstructions: "Pay the North treasurer." })).toMatchObject({ ok: false });
    mocks.userId = users.owner;
    expect(await setUnitPaymentInstructions({ organisationSlug: org.slug, unitId: units.north.id, paymentInstructions: "x".repeat(1001) })).toMatchObject({ ok: false });
    expect(await setUnitPaymentInstructions({ organisationSlug: org.slug, unitId: units.north.id, paymentInstructions: "Pay the North treasurer." })).toEqual({ ok: true });
    expect(await prisma.auditEvent.count({ where: { organisationId: org.id, action: "UNIT_PAYMENT_INSTRUCTIONS_CHANGED", targetId: units.north.id } })).toBe(1);

    const view = await buildPayView(terms.n1, org.id, {});
    expect(view.offline).toMatchObject({ instructions: "Pay the North treasurer.", unitName: "North 1", offlineOnly: true });
    expect(await loadPaymentGuidance(org.id, units.south.path, "INR")).toMatchObject({ instructions: "", unitName: "South", offlineOnly: true });

    await prisma.orgUnit.update({ where: { id: units.north1.id }, data: { paymentInstructions: "Cash to the North 1 secretary." } });
    await prisma.orgPaymentSettings.create({ data: { organisationId: org.id, provider: "NONE", webhookPublicCode: `wh-${suffix}`, offlineInstructions: "Bank transfer to Example Network." } });
    expect(await loadPaymentGuidance(org.id, units.north1.path, "INR")).toMatchObject({ instructions: "Cash to the North 1 secretary.", fromUnit: "North 1" });
    expect(await loadPaymentGuidance(org.id, units.south.path, "INR")).toMatchObject({ instructions: "Bank transfer to Example Network.", fromUnit: null });
    // A gateway chosen without saved keys can't take payments, so members are still told how to pay offline.
    await prisma.orgPaymentSettings.update({ where: { organisationId: org.id }, data: { provider: "RAZORPAY" } });
    expect(await loadPaymentGuidance(org.id, units.north1.path, "INR")).toMatchObject({ offlineOnly: true });
  });

  it("lets unit staff record payments only for members in their subtree", async () => {
    mocks.userId = users.secretary;
    expect(await recordPayment({ organisationSlug: org.slug, termId: terms.s1, method: "cash", reference: "RB-1" })).toEqual({ ok: false, error: "Membership not found." });
    expect(await prisma.payment.count({ where: { termId: terms.s1 } })).toBe(0);
    const recorded = await recordPayment({ organisationSlug: org.slug, termId: terms.n1, method: "cash", reference: "RB-1" });
    expect(recorded).toMatchObject({ ok: true, data: { settled: true } });
  });

  it("lists the unit's members who owe, and records a sheet row by row", async () => {
    mocks.userId = users.secretary;
    const sheet = await loadCollectionSheet({ ...params(), searchParams: Promise.resolve({ unit: units.south.id }) });
    // Out of reach: the secretary's own unit is used instead.
    expect(sheet.unitId).toBe(units.north.id);
    expect(sheet.rows.map((row) => row.termId).sort()).toEqual([terms.n2, terms.n3, terms.n4].sort());

    // A member's own claim waits on n3, so recording n3 fails without touching the other rows. It is made from an
    // account the member record isn't linked to, and is still marked as the member's claim, never staff cash.
    const claim = await prisma.$transaction((tx) => claimOfflinePayment(tx, { org, termId: terms.n3, method: "upi", utr: `UTR${suffix}`.slice(0, 20), userId: users.owner }));
    expect(claim.memberClaim).toBe(true);
    const result = await recordCollection({
      organisationSlug: org.slug,
      method: "cash",
      receivedOn: today(),
      rows: [{ termId: terms.n2, reference: "RB-102" }, { termId: terms.s1, reference: "RB-103" }, { termId: terms.n1, reference: "RB-104" }, { termId: terms.n3, reference: "RB-105" }],
    });
    expect(result.ok).toBe(true);
    const rows = result.ok ? result.data!.results : [];
    expect(rows.map((row) => [row.termId, row.outcome])).toEqual([[terms.n2, "recorded"], [terms.s1, "failed"], [terms.n1, "already-paid"], [terms.n3, "failed"]]);
    expect(rows[1]).toMatchObject({ reason: "Membership not found." });
    expect(rows[3]).toMatchObject({ reason: "A payment is waiting for the team to confirm it." });
    expect(rows[0]).toMatchObject({ settled: true });

    const paid = await prisma.payment.findFirstOrThrow({ where: { termId: terms.n2 }, include: { documents: true } });
    expect(paid).toMatchObject({ status: "PAID", reference: "RB-102", recordedById: users.secretary });
    expect(paid.note).toMatch(/^Received .+\. Collection sheet\.$/);
    expect(paid.documents).toHaveLength(1);
    expect(await prisma.payment.count({ where: { termId: terms.s1 } })).toBe(0);
    expect(await prisma.payment.count({ where: { termId: terms.n1, status: "PAID" } })).toBe(1);
  });

  it("refuses a future day and an oversized sheet", async () => {
    mocks.userId = users.secretary;
    expect(await recordCollection({ organisationSlug: org.slug, method: "cash", receivedOn: "2999-01-01", rows: [{ termId: terms.n4, reference: null }] })).toMatchObject({ ok: false });
    expect(await recordCollection({ organisationSlug: org.slug, method: "cash", receivedOn: today(), rows: Array.from({ length: 201 }, (_, index) => ({ termId: `t${index}`, reference: null })) })).toMatchObject({ ok: false });
  });

  it("leaves rows waiting for a second person when maker-checker is on", async () => {
    await prisma.organisation.update({ where: { id: org.id }, data: { offlineConfirmationRequired: true } });
    mocks.userId = users.secretary;
    const result = await recordCollection({ organisationSlug: org.slug, method: "cash", receivedOn: today(), rows: [{ termId: terms.n4, reference: "RB-106" }] });
    expect(result).toMatchObject({ ok: true, data: { results: [{ termId: terms.n4, outcome: "recorded", settled: false }] } });
    const waiting = await prisma.payment.findFirstOrThrow({ where: { termId: terms.n4 }, include: { documents: true } });
    expect(waiting.status).toBe("AWAITING_CONFIRMATION");
    expect(waiting.documents).toHaveLength(0);
    const sheet = await loadCollectionSheet({ ...params(), searchParams: Promise.resolve({}) });
    expect(sheet.makerChecker).toBe(true);
    expect(sheet.rows.find((row) => row.termId === terms.n4)?.waiting).toBe(true);

    expect(await confirmPayment({ organisationSlug: org.slug, paymentId: waiting.id })).toMatchObject({ ok: false });
    mocks.userId = users.checker;
    expect(await confirmPayment({ organisationSlug: org.slug, paymentId: waiting.id })).toEqual({ ok: true });
    expect(await prisma.taxDocument.count({ where: { paymentId: waiting.id } })).toBe(1);
    await prisma.organisation.update({ where: { id: org.id }, data: { offlineConfirmationRequired: false } });
  });

  it("reports cash in hand per collector and unit, within the viewer's reach", async () => {
    mocks.userId = users.owner;
    expect(await recordPayment({ organisationSlug: org.slug, termId: terms.s1, method: "cash", reference: "RB-201" })).toMatchObject({ ok: true });

    const all = await loadOrgReportsCash({ ...params(), searchParams: Promise.resolve({}) });
    expect(all.byCollector.map((row) => [row.label, row.payments, row.held])).toEqual([
      ["secretary", 3, [{ currency: "INR", minor: 150_000 }]],
      ["owner", 1, [{ currency: "INR", minor: 50_000 }]],
    ]);
    expect(all.held).toEqual([{ currency: "INR", minor: 200_000 }]);
    expect(all.byUnit.map((row) => row.label).sort()).toEqual(["North 1", "South"]);

    mocks.userId = users.secretary;
    const scoped = await loadOrgReportsCash({ ...params(), searchParams: Promise.resolve({}) });
    expect(scoped.byCollector.map((row) => row.label)).toEqual(["secretary"]);
    expect(scoped.byUnit.map((row) => row.label)).toEqual(["North 1"]);
    expect(scoped.held).toEqual([{ currency: "INR", minor: 150_000 }]);
  });
});
