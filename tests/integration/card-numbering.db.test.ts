import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { decideTerm, openTerm, startRenewal, upsertMember } from "@/lib/membership/service";
import { issueCardOnActivation, reissueCard, reissueCardsForRoleChange, revokeCard } from "@/lib/cards/issue";
import { designFor, loadCardOrgContext } from "@/lib/cards/data";
import { defaultCardDesign } from "@/lib/cards/design/presets";

/*
 * Card numbers belong to a membership: renewals and reissues (a new primary role) keep them, a new
 * registration after a lapse gets a new one, and a role with its own design numbers its own cards.
 */

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
let org: { id: string; timezone: string; financialYearStartMonth: number };
let plan: Awaited<ReturnType<typeof prisma.membershipPlan.create>>;
let ownerId = "";
const at = (iso: string) => new Date(iso);

async function joinAndApprove(email: string, roleId?: string) {
  const { member, term } = await prisma.$transaction(async (tx) => {
    const member = await upsertMember(tx, org.id, { email, name: "Priya Raman", source: "JOIN_FORM" });
    if (roleId) await tx.memberRoleAssignment.create({ data: { organisationId: org.id, memberId: member.id, roleId, isPrimary: true } });
    return { member, term: await openTerm(tx, { org, plan, memberId: member.id, byManager: false, actorUserId: null, now: at("2026-06-15T06:00:00Z") }) };
  });
  await prisma.$transaction((tx) => decideTerm(tx, { org, termId: term.id, action: "approve", actorUserId: ownerId, now: at("2026-06-15T07:00:00Z") }));
  return member.id;
}

const cardsOf = (memberId: string) => prisma.memberCard.findMany({ where: { memberId }, orderBy: { issuedAt: "asc" } });

beforeAll(async () => {
  const created = await prisma.organisation.create({ data: { name: "Card Numbers Lab", slug: `numbers-${suffix}`, status: "ACTIVE" } });
  org = { id: created.id, timezone: created.timezone, financialYearStartMonth: created.financialYearStartMonth };
  plan = await prisma.membershipPlan.create({ data: { organisationId: org.id, name: "Annual member", slug: `annual-${suffix}`, currency: "INR", priceNewMinor: 0, priceRenewalMinor: 0, joinMode: "APPROVAL" } });
  ownerId = (await prisma.user.create({ data: { email: `numbers-owner-${suffix}@example.test`, emailVerified: new Date() } })).id;
});

afterAll(async () => {
  if (org) {
    await prisma.$executeRaw`DELETE FROM "OutboxMessage" WHERE "payload"->>'organisationId' = ${org.id}`;
    await prisma.memberCard.deleteMany({ where: { organisationId: org.id } });
    await prisma.organisation.delete({ where: { id: org.id } }).catch(() => undefined);
  }
  if (ownerId) await prisma.user.delete({ where: { id: ownerId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe.sequential("card numbers", () => {
  let memberId = "";
  let roleId = "";

  it("numbers cards from the organisation's running number", async () => {
    memberId = await joinAndApprove(`first-${suffix}@example.test`);
    const second = await joinAndApprove(`second-${suffix}@example.test`);
    expect((await cardsOf(memberId)).map((card) => card.cardNumber)).toEqual(["CNL-0001"]);
    expect((await cardsOf(second)).map((card) => card.cardNumber)).toEqual(["CNL-0002"]);
  });

  it("keeps the number through a renewal", async () => {
    await prisma.$transaction((tx) => startRenewal(tx, { org, plan, memberId, byManager: true, actorUserId: ownerId, now: at("2027-03-20T06:00:00Z") }));
    const cards = await cardsOf(memberId);
    expect(cards.map((card) => [card.cardNumber, card.revokedAt])).toEqual([["CNL-0001", null]]);
  });

  it("reissues the card under a new QR when the primary role changes, keeping the number", async () => {
    roleId = (await prisma.memberRole.create({ data: { organisationId: org.id, name: `Secretary ${suffix}` } })).id;
    const before = (await cardsOf(memberId))[0]!;
    await prisma.$transaction(async (tx) => {
      await tx.memberRoleAssignment.create({ data: { organisationId: org.id, memberId, roleId, isPrimary: true } });
      expect(await reissueCardsForRoleChange(tx, org.id, memberId, ownerId)).toBe(1);
    });
    const cards = await cardsOf(memberId);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ id: before.id, revokedReason: "REISSUED" });
    expect(cards[1]).toMatchObject({ cardNumber: "CNL-0001", revokedAt: null });
    expect(cards[1]!.verifyToken).not.toBe(before.verifyToken);
  });

  it("keeps the number when someone still in grace registers again instead of renewing", async () => {
    // The 2027 renewal ends in 2028; in its grace period the member fills in the join form.
    const term = await prisma.membershipTerm.findFirstOrThrow({ where: { memberId, planId: plan.id }, orderBy: { startsAt: "desc" } });
    const inGrace = new Date(term.endsAt!.getTime() + 24 * 3600_000);
    expect(term.graceUntil!.getTime()).toBeGreaterThan(inGrace.getTime());
    const before = (await cardsOf(memberId)).filter((card) => !card.revokedAt);
    const fresh = await prisma.$transaction((tx) => openTerm(tx, { org, plan, memberId, byManager: true, actorUserId: ownerId, now: inGrace }));
    await prisma.$transaction((tx) => issueCardOnActivation(tx, fresh, ownerId, inGrace));
    const live = (await cardsOf(memberId)).filter((card) => !card.revokedAt);
    expect(live.map((card) => card.cardNumber)).toEqual(before.map((card) => card.cardNumber));
    await prisma.membershipTerm.delete({ where: { id: fresh.id } });
  });

  it("gives a new registration after a lapse a new number and ends the old card", async () => {
    await prisma.$transaction((tx) => startRenewal(tx, { org, plan, memberId, byManager: true, actorUserId: ownerId, now: at("2030-01-10T06:00:00Z") }));
    const cards = await cardsOf(memberId);
    const live = cards.filter((card) => !card.revokedAt);
    expect(live).toHaveLength(1);
    expect(live[0]!.cardNumber).toBe("CNL-0003");
    expect(cards.find((card) => card.cardNumber === "CNL-0001" && card.revokedReason === "MEMBERSHIP_ENDED")).toBeTruthy();
  });

  it("keeps the number when a manager reissues a revoked card", async () => {
    const live = (await cardsOf(memberId)).find((card) => !card.revokedAt)!;
    await prisma.$transaction((tx) => revokeCard(tx, { organisationId: org.id, cardId: live.id, actorUserId: ownerId }));
    const replacement = await prisma.$transaction((tx) => reissueCard(tx, { organisationId: org.id, memberId, planId: plan.id }, ownerId));
    expect(replacement.cardNumber).toBe(live.cardNumber);
  });

  it("numbers a role's cards with the role's own prefix and pattern once it has a design", async () => {
    await prisma.cardDesign.create({ data: { organisationId: org.id, roleId, design: defaultCardDesign({ organisationName: "Card Numbers Lab", planName: "" }), numberPrefix: "SEC", numberFormat: "{PREFIX}/{SEQ:3}" } });
    const secretary = await joinAndApprove(`secretary-${suffix}@example.test`, roleId);
    expect((await cardsOf(secretary)).map((card) => card.cardNumber)).toEqual(["SEC/001"]);
  });

  it("the database refuses a pattern without the running number, and a design for both a plan and a role", async () => {
    const base = { organisationId: org.id, design: {}, numberPrefix: "X" };
    await expect(prisma.cardDesign.create({ data: { ...base, planId: plan.id, numberFormat: "{PREFIX}-{MEMBER}" } })).rejects.toThrow();
    await expect(prisma.cardDesign.create({ data: { ...base, planId: plan.id, roleId } })).rejects.toThrow();
  });

  it("prefers the member's primary role design over the plan's and the organisation's", async () => {
    await prisma.cardDesign.create({ data: { organisationId: org.id, design: defaultCardDesign({ organisationName: "Org", planName: "" }), numberPrefix: "CNL" } });
    await prisma.cardDesign.create({ data: { organisationId: org.id, planId: plan.id, design: defaultCardDesign({ organisationName: "Plan", planName: "" }), numberPrefix: "CNL" } });
    const ctx = (await loadCardOrgContext(org.id))!;
    expect(designFor(ctx, plan, roleId)).toMatchObject({ source: "role" });
    expect(designFor(ctx, plan, null)).toMatchObject({ source: "plan" });
    expect(designFor(ctx, { id: "other", name: "Other" }, null)).toMatchObject({ source: "organisation" });
    expect(designFor(ctx, { id: "other", name: "Other" }, "no-such-role")).toMatchObject({ source: "organisation" });
  });
});
