import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ current: { id: "", email: "" } }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.current.id ? { user: identity.current } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { Prisma, type MembershipPlan } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addStaff } from "../helpers/staff";
import { addMember, renewMember } from "@/app/actions/members";
import { commitMemberImport } from "@/app/actions/member-import";
import { markTermPaid, MembershipError, openTerm, startRenewal, upsertMember } from "@/lib/membership/service";
import { queueRenewalReminders, sweepTermStatuses } from "@/lib/membership/sweep";
import { deliverRenewalReminder } from "@/lib/email/membership";
import { walletState } from "@/lib/portal/walletStatus";
import { createTermPayment, type OrgForPayments } from "@/lib/payments/charges";
import { settlePayment } from "@/lib/payments/settle";
import { at, createPaymentsOrg, people, removePaymentsOrg, suffix, unpaidTerm } from "./payments-helpers";

let org: OrgForPayments;
let annual: MembershipPlan;
let northOnly: MembershipPlan;
let staff: Array<{ id: string; email: string | null }>;
const units: Record<string, { id: string; path: string }> = {};
const email = (name: string) => `${name}-${suffix}@example.test`;
const signIn = (index: number) => {
  identity.current = { id: staff[index].id, email: staff[index].email! };
};
const plan = (slug: string, data: Record<string, unknown>) => prisma.membershipPlan.create({ data: { organisationId: org.id, name: slug, slug: `${slug}-${suffix}`, currency: "INR", joinMode: "OPEN", ...data } as never });
const member = (name: string, unitId: string | null = null) => prisma.$transaction((tx) => upsertMember(tx, org.id, { email: email(name), name, unitId, source: "MANUAL" }));

beforeAll(async () => {
  ({ org, plan: annual } = await createPaymentsOrg());
  staff = await people(2);
  await prisma.user.updateMany({ where: { id: { in: staff.map((person) => person.id) } }, data: { emailVerified: new Date(), mfaEnabledAt: new Date() } });
  for (const [key, code] of [["north", "NTH"], ["south", "STH"]]) {
    const created = await prisma.orgUnit.create({ data: { organisationId: org.id, name: key, slug: key, code, level: 0, path: "pending" } });
    units[key] = await prisma.orgUnit.update({ where: { id: created.id }, data: { path: created.id }, select: { id: true, path: true } });
  }
  await addStaff(org.id, staff[0].id, "OWNER");
  await addStaff(org.id, staff[1].id, "ADMIN", units.north.id);
  northOnly = await plan("north-only", { allUnits: false });
  await prisma.planUnit.create({ data: { organisationId: org.id, planId: northOnly.id, unitId: units.north.id } });
});

afterAll(async () => {
  if (org) {
    await prisma.planUnit.deleteMany({ where: { organisationId: org.id } });
    await removePaymentsOrg(org.id, staff.map((person) => person.id));
  }
  await prisma.$disconnect();
});

describe.sequential("membership lifecycle guards", () => {
  it("never lets a manager limited to a unit take over a member filed in another unit", async () => {
    const outsider = await member("outsider", units.south.id);
    signIn(1);
    const result = await addMember({ organisationSlug: org.slug, profile: { name: "Taken Over", email: email("outsider"), unitId: units.north.id } });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/outside your unit/) });
    expect(await prisma.member.findUniqueOrThrow({ where: { id: outsider.id } })).toMatchObject({ name: "outsider", unitId: units.south.id });
  });

  it("offers a plan limited to units only inside them, when adding, renewing and importing", async () => {
    signIn(1);
    expect(await addMember({ organisationSlug: org.slug, profile: { name: "North Member", email: email("north-add"), unitId: units.north.id }, planId: northOnly.id })).toMatchObject({ ok: true });
    signIn(0);
    expect(await addMember({ organisationSlug: org.slug, profile: { name: "South Member", email: email("south-add"), unitId: units.south.id }, planId: northOnly.id })).toMatchObject({ ok: false, error: "This plan isn't offered in that unit." });
    expect(await prisma.member.count({ where: { organisationId: org.id, email: email("south-add") } })).toBe(0);
    const south = await member("south-renew", units.south.id);
    expect(await renewMember({ organisationSlug: org.slug, memberId: south.id, planId: northOnly.id })).toMatchObject({ ok: false, error: "This plan isn't offered in this member's unit." });
    const text = ["Name,Email,Unit", `North Import,${email("north-import")},nth`, `South Import,${email("south-import")},sth`].join("\n");
    const imported = await commitMemberImport({ organisationSlug: org.slug, mapping: ["name", "email", "unit"], source: { kind: "csv", text }, planId: northOnly.id, membership: "start" });
    expect(imported).toMatchObject({ ok: true, data: { created: 1, skipped: [{ row: 3, reason: "Plan not offered in this unit" }] } });
    expect(await prisma.membershipTerm.count({ where: { planId: northOnly.id, member: { email: email("north-import") } } })).toBe(1);
  });

  it("refuses a second new membership while one is current", async () => {
    const june = at("2026-06-01T06:00:00Z");
    const term = await unpaidTerm(org, annual, "twice", june);
    await prisma.$transaction((tx) => markTermPaid(tx, { org, termId: term.id, actorUserId: null, now: june }));
    const again = prisma.$transaction((tx) => openTerm(tx, { org, plan: annual, memberId: term.memberId, byManager: false, actorUserId: null, now: at("2026-07-01T06:00:00Z") }));
    await expect(again).rejects.toBeInstanceOf(MembershipError);
    await expect(again).rejects.toThrow(/already holds a current membership/);
  });

  it("receipts and flags a late capture for an expired term after the member joined again, instead of failing", async () => {
    const june = at("2026-06-15T06:00:00Z");
    const july = at("2026-07-15T06:00:00Z");
    const first = await unpaidTerm(org, annual, "late", june);
    const payment = await prisma.$transaction((tx) => createTermPayment(tx, { org, termId: first.id, provider: "RAZORPAY", status: "PENDING", now: june }));
    await sweepTermStatuses(july);
    expect((await prisma.membershipTerm.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("EXPIRED");
    const second = await prisma.$transaction((tx) => openTerm(tx, { org, plan: annual, memberId: first.memberId, byManager: true, actorUserId: null, now: july }));
    await prisma.$transaction((tx) => markTermPaid(tx, { org, termId: second.id, actorUserId: null, now: july }));

    const capture = { gatewayPaymentId: `pay_${suffix}`, amountMinor: payment.amountMinor, currency: "INR", method: "upi" };
    const settled = await prisma.$transaction((tx) => settlePayment(tx, { org, paymentId: payment.id, capture, now: at("2026-07-16T06:00:00Z") }));
    expect(settled.payment.status).toBe("PAID");
    expect(settled.flagged).toMatch(/couldn't start: This member already holds this membership/);
    expect(await prisma.taxDocument.count({ where: { paymentId: payment.id } })).toBe(1);
    expect((await prisma.membershipTerm.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("EXPIRED");
    expect((await prisma.membershipTerm.findUniqueOrThrow({ where: { id: second.id } })).status).toBe("ACTIVE");
  });

  it("refuses to revive an expired renewal once another renewal of the same term is live", async () => {
    const free = await plan("free-renew", { priceNewMinor: 0, priceRenewalMinor: 0, renewalWindowDays: 30 });
    const m = await member("renewer");
    const start = await prisma.$transaction((tx) => openTerm(tx, { org, plan: free, memberId: m.id, byManager: true, actorUserId: null, now: at("2026-06-01T06:00:00Z") }));
    const later = await prisma.$transaction((tx) => startRenewal(tx, { org, plan: free, memberId: m.id, byManager: true, actorUserId: null, now: at("2027-03-20T06:00:00Z") }));
    expect(later).toMatchObject({ kind: "RENEWAL", status: "UPCOMING" });
    // An older renewal of the same term that expired unpaid, as if its payment arrived late.
    const stale = await prisma.membershipTerm.create({ data: { organisationId: org.id, memberId: m.id, planId: free.id, status: "EXPIRED", kind: "RENEWAL", currency: "INR", priceMinor: 0, renewedFromId: start.id } });
    await expect(prisma.$transaction((tx) => markTermPaid(tx, { org, termId: stale.id, actorUserId: null, now: at("2027-03-21T06:00:00Z") }))).rejects.toBeInstanceOf(MembershipError);
  });

  it("reports the database's no-overlap rule as an unknown request error naming the constraint", async () => {
    const m = await member("overlap");
    const base = { organisationId: org.id, memberId: m.id, planId: annual.id, currency: "INR", priceMinor: 0, startsAt: at("2026-06-01T00:00:00Z"), endsAt: at("2027-06-01T00:00:00Z") };
    await prisma.membershipTerm.create({ data: { ...base, status: "ACTIVE", kind: "NEW" } });
    const error = await prisma.membershipTerm.create({ data: { ...base, status: "ACTIVE", kind: "NEW" } }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Prisma.PrismaClientUnknownRequestError);
    expect((error as Error).message).toContain("MembershipTerm_no_overlap");
  });

  it("won't renew a fixed-end plan past its end date, and the wallet hides Renew", async () => {
    const fixed = await plan("fixed", { durationType: "FIXED_END", fixedEndDate: at("2027-03-31T00:00:00Z"), priceNewMinor: 0, priceRenewalMinor: 500, renewalWindowDays: 30 });
    const m = await member("fixed");
    const term = await prisma.$transaction((tx) => openTerm(tx, { org, plan: fixed, memberId: m.id, byManager: true, actorUserId: null, now: at("2026-06-01T06:00:00Z") }));
    expect(term.status).toBe("ACTIVE");
    const now = at("2027-03-20T06:00:00Z");
    await expect(prisma.$transaction((tx) => startRenewal(tx, { org, plan: fixed, memberId: m.id, byManager: false, actorUserId: null, now }))).rejects.toThrow(/can't be renewed/);
    expect(await prisma.membershipTerm.count({ where: { memberId: m.id } })).toBe(1);
    const args = { now, timeZone: org.timezone, organisationActive: true };
    expect(walletState([{ ...term, kind: "NEW" }], fixed, args).actions.renew).toBe(false);
    expect(walletState([{ ...term, kind: "NEW" }], { ...fixed, fixedEndDate: at("2028-03-31T00:00:00Z") }, args).actions.renew).toBe(true);
  });

  it("stops 'membership has ended' reminders once the member has joined again", async () => {
    const free = await plan("free-rejoin", { priceNewMinor: 0, graceDays: 5, reminderDaysBefore: [], reminderDaysAfter: [30] });
    const m = await member("rejoin");
    const old = await prisma.$transaction((tx) => openTerm(tx, { org, plan: free, memberId: m.id, byManager: true, actorUserId: null, now: at("2026-06-01T06:00:00Z") }));
    await sweepTermStatuses(at("2027-04-10T00:00:00Z"));
    const rejoined = await prisma.$transaction((tx) => startRenewal(tx, { org, plan: free, memberId: m.id, byManager: false, actorUserId: null, now: at("2027-04-10T06:00:00Z") }));
    expect(rejoined).toMatchObject({ kind: "NEW", status: "ACTIVE", renewedFromId: null });
    await queueRenewalReminders(at("2027-05-02T00:00:00Z"));
    expect(await prisma.outboxMessage.count({ where: { kind: "renewal-reminder", payload: { path: ["termId"], equals: old.id } } })).toBe(0);
    expect(await deliverRenewalReminder({ termId: old.id, organisationId: org.id, key: "after-30" }, `msg-${suffix}`)).toBe("dropped");
  });
});
