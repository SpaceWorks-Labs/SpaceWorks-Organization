import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const group = vi.hoisted(() => ({ inGroup: true }));
vi.mock("@/lib/groups/conditions", () => ({ memberInSmartGroup: async () => group.inGroup }));

import { prisma } from "@/lib/db";
import { decideTerm, openTerm, startRenewal, upsertMember } from "@/lib/membership/service";

// Renewal conditions (part C), all evaluated in startRenewal so each change writes status events and audit rows.
const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const at = (iso: string) => new Date(iso);
let org: { id: string; timezone: string; financialYearStartMonth: number };
const plans: Record<string, Awaited<ReturnType<typeof prisma.membershipPlan.create>>> = {};

async function plan(slug: string, data: Record<string, unknown> = {}) {
  return prisma.membershipPlan.create({ data: { organisationId: org.id, name: slug, slug: `${slug}-${suffix}`, currency: "INR", joinMode: "OPEN", paymentMode: "FREE", ...data } as never });
}
async function member(name: string, fieldValues: Record<string, unknown> = {}) {
  return prisma.$transaction((tx) => upsertMember(tx, org.id, { email: `${name}-${suffix}@example.test`, name, source: "MANUAL", fieldValues }));
}
/** A member holding an active term on the plan, ending 31 March 2027 (India time). */
async function joined(planKey: string, name: string, fieldValues: Record<string, unknown> = {}) {
  const m = await member(name, fieldValues);
  await prisma.$transaction((tx) => openTerm(tx, { org, plan: plans[planKey], memberId: m.id, byManager: false, actorUserId: null, now: at("2026-06-15T06:00:00Z") }));
  return m;
}
const renew = (planKey: string, memberId: string, now: string, extra: Record<string, unknown> = {}) =>
  prisma.$transaction((tx) => startRenewal(tx, { org, plan: plans[planKey], memberId, byManager: false, actorUserId: null, now: at(now), ...extra }));

beforeAll(async () => {
  const created = await prisma.organisation.create({ data: { name: "Renewals", slug: `renewals-${suffix}`, status: "ACTIVE" } });
  org = { id: created.id, timezone: created.timezone, financialYearStartMonth: created.financialYearStartMonth };
  plans.windowed = await plan("windowed", { renewalWindowDays: 30 });
  plans.approval = await plan("approval", { renewalPolicy: { requireApproval: true } });
  plans.reask = await plan("reask", { renewalPolicy: { reaskAnswers: true, reaskPhoto: true } });
  await prisma.planField.create({ data: { organisationId: org.id, planId: plans.reask.id, key: "city", label: "City", required: true, type: "TEXT" } });
  plans.eligible = await plan("eligible", { renewalPolicy: { eligibleGroupId: "grp" } });
  plans.annual = await plan("annual", { paymentMode: "ONLINE_OR_IN_HAND", priceNewMinor: 240_000, priceRenewalMinor: 200_000 });
  plans.student = await plan("student", { renewalPolicy: { renewInto: { targetPlanId: plans.annual.id, when: { ageAtLeast: 25 } } } });
  plans.veteran = await plan("veteran", { renewalPolicy: { renewInto: { targetPlanId: plans.annual.id, when: { afterYears: 2 } } } });
  plans.plain = await plan("plain", { graceDays: 10 });
  plans.stretched = await plan("stretched", { graceDays: 10, renewalPolicy: { extraGraceDays: 20 } });
});

beforeEach(() => {
  group.inGroup = true;
});

afterAll(async () => {
  if (org) {
    await prisma.$executeRaw`DELETE FROM "OutboxMessage" WHERE "payload"->>'organisationId' = ${org.id}`;
    await prisma.organisation.delete({ where: { id: org.id } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

describe.sequential("renewal window", () => {
  it("refuses a member before the window opens, and lets staff through", async () => {
    const m = await joined("windowed", "early");
    await expect(renew("windowed", m.id, "2026-10-01T06:00:00Z")).rejects.toThrow(/Renewal opens on/);
    const byStaff = await prisma.$transaction((tx) => startRenewal(tx, { org, plan: plans.windowed, memberId: m.id, byManager: true, actorUserId: null, now: at("2026-10-01T06:00:00Z") }));
    expect(byStaff.kind).toBe("RENEWAL");
  });

  it("opens the renewal inside the window and records the status events", async () => {
    const m = await joined("windowed", "ontime");
    const term = await renew("windowed", m.id, "2027-03-10T06:00:00Z");
    expect(term).toMatchObject({ kind: "RENEWAL", status: "UPCOMING" });
    expect((await prisma.termStatusEvent.findMany({ where: { termId: term.id } })).map((event) => event.cause)).toContain("renewal-started");
    await expect(renew("windowed", m.id, "2027-03-11T06:00:00Z")).rejects.toThrow(/already/);
  });
});

describe.sequential("renewal approval", () => {
  it("makes a member's renewal wait, while staff renewing skip it", async () => {
    const m = await joined("approval", "approver");
    const term = await renew("approval", m.id, "2027-03-10T06:00:00Z");
    expect(term.status).toBe("PENDING_APPROVAL");
    const approved = await prisma.$transaction((tx) => decideTerm(tx, { org, termId: term.id, action: "approve", actorUserId: (null as unknown) as string, now: at("2027-03-11T06:00:00Z") }));
    expect(approved).toMatchObject({ status: "UPCOMING", renewedFromId: term.renewedFromId });
    expect(await prisma.auditEvent.count({ where: { organisationId: org.id, action: "MEMBERSHIP_APPROVE", targetId: term.id } })).toBe(1);

    const other = await joined("approval", "approver2");
    const bystaff = await prisma.$transaction((tx) => startRenewal(tx, { org, plan: plans.approval, memberId: other.id, byManager: true, actorUserId: null, now: at("2027-03-10T06:00:00Z") }));
    expect(bystaff.status).toBe("UPCOMING");
  });
});

describe.sequential("asking again at renewal", () => {
  it("needs a photo and answers, and saves the answers on the member", async () => {
    const m = await joined("reask", "reasker", { city: "Old town", other: "kept" });
    const photo = { body: Buffer.from("x") };
    await expect(renew("reask", m.id, "2027-03-10T06:00:00Z", { reask: {} })).rejects.toThrow(/photo/);
    await expect(renew("reask", m.id, "2027-03-10T06:00:00Z", { reask: { photo } })).rejects.toThrow(/details/);
    await expect(renew("reask", m.id, "2027-03-10T06:00:00Z", { reask: { photo, answers: {} } })).rejects.toThrow(/City is required/);
    const term = await renew("reask", m.id, "2027-03-10T06:00:00Z", { reask: { photo, answers: { city: "Kochi" } } });
    expect(term.kind).toBe("RENEWAL");
    expect((await prisma.member.findUniqueOrThrow({ where: { id: m.id } })).fieldValues).toMatchObject({ city: "Kochi", other: "kept" });
  });
});

describe.sequential("who may renew", () => {
  it("follows the smart group", async () => {
    const m = await joined("eligible", "grouped");
    group.inGroup = false;
    await expect(renew("eligible", m.id, "2027-03-10T06:00:00Z")).rejects.toThrow(/can't be renewed by you/);
    group.inGroup = true;
    expect((await renew("eligible", m.id, "2027-03-10T06:00:00Z")).kind).toBe("RENEWAL");
  });
});

describe.sequential("renewing into another plan", () => {
  it("moves a member at the age, charging the new plan's renewal price", async () => {
    const old = await joined("student", "elder", { dob: "2000-03-01" });
    const term = await renew("student", old.id, "2027-03-10T06:00:00Z");
    expect(term).toMatchObject({ planId: plans.annual.id, kind: "RENEWAL", priceMinor: 200_000 });
    expect(term.renewedFromId).not.toBeNull();
    expect((await prisma.termStatusEvent.findMany({ where: { termId: term.id } })).map((event) => event.cause)).toContain("renewed-into-plan");
    expect(await prisma.auditEvent.count({ where: { organisationId: org.id, action: "MEMBERSHIP_RENEWED_INTO_PLAN", targetId: term.id } })).toBe(1);

    const young = await joined("student", "younger", { dob: "2005-03-01" });
    expect((await renew("student", young.id, "2027-03-10T06:00:00Z")).planId).toBe(plans.student.id);
    const unknown = await joined("student", "nodob");
    expect((await renew("student", unknown.id, "2027-03-10T06:00:00Z")).planId).toBe(plans.student.id);
  });

  it("moves a member after enough years on the plan", async () => {
    const m = await member("veteran");
    await prisma.membershipTerm.create({
      data: { organisationId: org.id, memberId: m.id, planId: plans.veteran.id, status: "ACTIVE", kind: "NEW", currency: "INR", priceMinor: 0, startsAt: at("2024-03-31T18:30:00Z"), endsAt: at("2027-03-31T18:30:00Z"), graceUntil: at("2027-04-15T18:30:00Z") },
    });
    const term = await renew("veteran", m.id, "2027-03-10T06:00:00Z");
    expect(term).toMatchObject({ planId: plans.annual.id, priceMinor: 200_000 });

    const fresh = await joined("veteran", "newcomer");
    expect((await renew("veteran", fresh.id, "2027-03-10T06:00:00Z")).planId).toBe(plans.veteran.id);
  });
});

describe.sequential("lapse rule", () => {
  it("keeps a member in grace for the extra days", async () => {
    const a = await joined("plain", "lapse-a");
    const b = await joined("stretched", "lapse-b");
    const [plainTerm, stretchedTerm] = await Promise.all([
      prisma.membershipTerm.findFirstOrThrow({ where: { memberId: a.id } }),
      prisma.membershipTerm.findFirstOrThrow({ where: { memberId: b.id } }),
    ]);
    expect(stretchedTerm.endsAt).toEqual(plainTerm.endsAt);
    expect((stretchedTerm.graceUntil!.getTime() - plainTerm.graceUntil!.getTime()) / 86_400_000).toBe(20);
  });
});
