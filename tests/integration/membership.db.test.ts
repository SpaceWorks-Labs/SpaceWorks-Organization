import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));

import { prisma } from "@/lib/db";
import { activateTerm, decideTerm, markTermPaid, nextCounter, openTerm, startRenewal, upsertMember } from "@/lib/membership/service";
import { queueRenewalReminders, sweepTermStatuses } from "@/lib/membership/sweep";
import { memberWhere, teamScope } from "@/lib/membership/scope";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
let org: { id: string; timezone: string; financialYearStartMonth: number };
const plans: Record<string, Awaited<ReturnType<typeof prisma.membershipPlan.create>>> = {};
const at = (iso: string) => new Date(iso);

async function plan(slug: string, data: Partial<Parameters<typeof prisma.membershipPlan.create>[0]["data"]>) {
  return prisma.membershipPlan.create({ data: { organisationId: org.id, name: slug, slug: `${slug}-${suffix}`, currency: "INR", ...data } as never });
}

async function member(email: string) {
  return prisma.$transaction((tx) => upsertMember(tx, org.id, { email, name: email.split("@")[0], source: "MANUAL" }));
}

beforeAll(async () => {
  const created = await prisma.organisation.create({ data: { name: "SpaceWorks", slug: `spaceworks-${suffix}`, status: "ACTIVE" } });
  org = { id: created.id, timezone: created.timezone, financialYearStartMonth: created.financialYearStartMonth };
  plans.free = await plan("free", { priceNewMinor: 0, priceRenewalMinor: 0, joinMode: "OPEN" });
  plans.approval = await plan("annual", { priceNewMinor: 120_000, priceRenewalMinor: 100_000, joiningFeeMinor: 50_000, joinMode: "APPROVAL" });
  plans.later = await plan("later", { priceNewMinor: 60_000, joinMode: "OPEN", paymentTiming: "ACTIVATE_THEN_CHARGE" });
});

afterAll(async () => {
  if (org) {
    await prisma.$executeRaw`DELETE FROM "OutboxMessage" WHERE "payload"->>'organisationId' = ${org.id}`;
    await prisma.organisation.delete({ where: { id: org.id } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

describe.sequential("membership service", () => {
  it("numbers members without gaps and reuses the record for the same email", async () => {
    const a = await member(`shaan-${suffix}@example.test`);
    const b = await member(`abhiram-${suffix}@example.test`);
    const again = await member(`SHAAN-${suffix}@example.test`);
    expect(b.memberNumber).toBe(a.memberNumber + 1);
    expect(again.id).toBe(a.id);
    expect(await prisma.$transaction((tx) => nextCounter(tx, org.id, "member"))).toBe(b.memberNumber + 1);
  });

  it("starts a free open plan straight away", async () => {
    const m = await member(`free-${suffix}@example.test`);
    const term = await prisma.$transaction((tx) => openTerm(tx, { org, plan: plans.free, memberId: m.id, byManager: false, actorUserId: null, now: at("2026-06-15T06:00:00Z") }));
    expect(term.status).toBe("ACTIVE");
    expect(term.startsAt?.toISOString()).toBe("2026-06-14T18:30:00.000Z");
    expect(term.endsAt?.toISOString()).toBe("2027-03-31T18:30:00.000Z");
  });

  it("takes an application through approval and payment, charging the joining fee once", async () => {
    const m = await member(`apply-${suffix}@example.test`);
    const applied = await prisma.$transaction((tx) => openTerm(tx, { org, plan: plans.approval, memberId: m.id, byManager: false, actorUserId: null, now: at("2026-04-02T06:00:00Z") }));
    expect(applied).toMatchObject({ status: "PENDING_APPROVAL", priceMinor: 120_000, joiningFeeMinor: 50_000 });
    // A second open application on the same plan is refused by the database.
    await expect(prisma.$transaction((tx) => openTerm(tx, { org, plan: plans.approval, memberId: m.id, byManager: false, actorUserId: null }))).rejects.toThrow();

    const approved = await prisma.$transaction((tx) => decideTerm(tx, { org, termId: applied.id, action: "approve", actorUserId: null as unknown as string, now: at("2026-04-02T07:00:00Z") }));
    expect(approved.status).toBe("PENDING_PAYMENT");
    expect(approved.paymentDueBy).not.toBeNull();

    const paid = await prisma.$transaction((tx) => markTermPaid(tx, { org, termId: applied.id, actorUserId: null, now: at("2026-04-02T08:00:00Z") }));
    expect(paid.status).toBe("ACTIVE");
    const events = await prisma.termStatusEvent.findMany({ where: { termId: applied.id }, orderBy: { recordedAt: "asc" } });
    expect(events.map((event) => event.to)).toEqual(["PENDING_APPROVAL", "PENDING_PAYMENT", "ACTIVE"]);
  });

  it("renews early into an upcoming term that starts when the old one ends", async () => {
    const m = await prisma.member.findFirstOrThrow({ where: { organisationId: org.id, email: `apply-${suffix}@example.test` } });
    const renewal = await prisma.$transaction((tx) => startRenewal(tx, { org, plan: plans.approval, memberId: m.id, byManager: false, actorUserId: null, now: at("2027-03-10T06:00:00Z") }));
    expect(renewal).toMatchObject({ kind: "RENEWAL", status: "PENDING_PAYMENT", priceMinor: 100_000, joiningFeeMinor: 0 });
    const upcoming = await prisma.$transaction((tx) => markTermPaid(tx, { org, termId: renewal.id, actorUserId: null, now: at("2027-03-18T06:00:00Z") }));
    expect(upcoming.status).toBe("UPCOMING");
    expect(upcoming.startsAt?.toISOString()).toBe("2027-03-31T18:30:00.000Z");
    expect(upcoming.endsAt?.toISOString()).toBe("2028-03-31T18:30:00.000Z");
  });

  it("refuses overlapping live terms at the database", async () => {
    const m = await prisma.member.findFirstOrThrow({ where: { organisationId: org.id, email: `apply-${suffix}@example.test` } });
    await expect(prisma.membershipTerm.create({
      data: { organisationId: org.id, memberId: m.id, planId: plans.approval.id, status: "ACTIVE", currency: "INR", priceMinor: 0, startsAt: at("2027-01-01T00:00:00Z"), endsAt: at("2027-06-01T00:00:00Z") },
    })).rejects.toThrow();
  });

  it("starts an activate-then-charge plan before payment", async () => {
    const m = await member(`later-${suffix}@example.test`);
    const term = await prisma.$transaction((tx) => openTerm(tx, { org, plan: plans.later, memberId: m.id, byManager: false, actorUserId: null, now: at("2026-05-01T06:00:00Z") }));
    expect(term.status).toBe("ACTIVE");
    expect(term.priceMinor).toBe(60_000);
  });

  it("sweeps statuses forward once, with domain times", async () => {
    const m = await member(`sweep-${suffix}@example.test`);
    const term = await prisma.$transaction((tx) => openTerm(tx, { org, plan: plans.free, memberId: m.id, byManager: true, actorUserId: null, now: at("2026-06-01T06:00:00Z") }));
    const graceTime = at("2027-04-05T00:00:00Z");
    await sweepTermStatuses(graceTime);
    expect((await prisma.membershipTerm.findUniqueOrThrow({ where: { id: term.id } })).status).toBe("GRACE");
    await sweepTermStatuses(graceTime);
    const graceEvents = await prisma.termStatusEvent.count({ where: { termId: term.id, to: "GRACE" } });
    expect(graceEvents).toBe(1);
    await sweepTermStatuses(at("2027-05-01T00:00:00Z"));
    const lapsed = await prisma.termStatusEvent.findFirstOrThrow({ where: { termId: term.id, to: "LAPSED" } });
    expect(lapsed.effectiveAt.toISOString()).toBe(term.graceUntil!.toISOString());
  });

  it("queues one reminder per due point, never twice", async () => {
    const m = await member(`remind-${suffix}@example.test`);
    const term = await prisma.$transaction((tx) => openTerm(tx, { org, plan: plans.free, memberId: m.id, byManager: true, actorUserId: null, now: at("2026-06-01T06:00:00Z") }));
    const now = at("2027-03-26T00:00:00Z"); // between 7 days and the day itself
    await queueRenewalReminders(now);
    await queueRenewalReminders(now);
    const logs = await prisma.reminderLog.findMany({ where: { termId: term.id } });
    expect(logs.map((log) => log.key).sort()).toEqual(["before-30", "before-7"]);
    const queued = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM "OutboxMessage" WHERE "kind" = 'renewal-reminder' AND "payload"->>'termId' = ${term.id}`;
    expect(Number(queued[0].count)).toBe(1);
  });

  it("limits a region manager to their unit's subtree", async () => {
    const kerala = await prisma.orgUnit.create({ data: { organisationId: org.id, name: "Kerala", slug: `kerala-${suffix}`, code: "KER", path: "pending" } });
    await prisma.orgUnit.update({ where: { id: kerala.id }, data: { path: kerala.id } });
    const kochi = await prisma.orgUnit.create({ data: { organisationId: org.id, parentId: kerala.id, name: "Kochi", slug: `kochi-${suffix}`, code: "KOC", level: 1, path: "pending" } });
    await prisma.orgUnit.update({ where: { id: kochi.id }, data: { path: `${kerala.id}/${kochi.id}` } });
    const karnataka = await prisma.orgUnit.create({ data: { organisationId: org.id, name: "Karnataka", slug: `karnataka-${suffix}`, code: "KAR", path: "pending" } });
    await prisma.orgUnit.update({ where: { id: karnataka.id }, data: { path: karnataka.id } });

    const inKochi = await prisma.$transaction((tx) => upsertMember(tx, org.id, { email: `midlaj-${suffix}@example.test`, name: "Midlaj C", unitId: kochi.id, source: "MANUAL" }));
    await prisma.$transaction((tx) => upsertMember(tx, org.id, { email: `ajzal-${suffix}@example.test`, name: "Ajzal P", unitId: karnataka.id, source: "MANUAL" }));

    const keralaScope = await teamScope(org.id, kerala.id);
    const seen = await prisma.member.findMany({ where: memberWhere(keralaScope), select: { id: true } });
    expect(seen.map((row) => row.id)).toEqual([inKochi.id]);
    const everyone = await prisma.member.count({ where: memberWhere(await teamScope(org.id, null)) });
    expect(everyone).toBeGreaterThan(1);
  });

  it("refuses a member in a unit of another organisation", async () => {
    const other = await prisma.organisation.create({ data: { name: "Tinkerspace", slug: `tinkerspace-${suffix}` } });
    try {
      const foreign = await prisma.orgUnit.create({ data: { organisationId: other.id, name: "Alappuzha", slug: `alappuzha-${suffix}`, code: "ALP", path: "x" } });
      await expect(prisma.$transaction((tx) => upsertMember(tx, org.id, { email: `cross-${suffix}@example.test`, name: "Cross", unitId: foreign.id, source: "MANUAL" }))).rejects.toThrow();
    } finally {
      await prisma.organisation.delete({ where: { id: other.id } });
    }
  });
});

describe("activation edge cases", () => {
  it("ends a term in grace when its renewal is paid late, backdating the new year", async () => {
    const m = await member(`late-${suffix}@example.test`);
    const first = await prisma.$transaction((tx) => openTerm(tx, { org, plan: plans.free, memberId: m.id, byManager: true, actorUserId: null, now: at("2026-06-01T06:00:00Z") }));
    await sweepTermStatuses(at("2027-04-05T00:00:00Z"));
    const renewal = await prisma.membershipTerm.create({ data: { organisationId: org.id, memberId: m.id, planId: plans.free.id, status: "PENDING_PAYMENT", kind: "RENEWAL", renewedFromId: first.id, currency: "INR", priceMinor: 0 } });
    const started = await prisma.$transaction((tx) => activateTerm(tx, { org, termId: renewal.id, actorUserId: null, cause: "paid", now: at("2027-04-08T06:00:00Z") }));
    expect(started.status).toBe("ACTIVE");
    expect(started.startsAt?.toISOString()).toBe(first.endsAt!.toISOString());
    expect((await prisma.membershipTerm.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("ENDED");
  });
});
