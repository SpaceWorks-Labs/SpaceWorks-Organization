import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { decideTerm, openTerm, upsertMember } from "@/lib/membership/service";
import { reissueCard } from "@/lib/cards/issue";
import { CARD_INCLUDE, holderFor, loadCardForRender, loadCardOrgContext, loadCardUnits, loadRoleCardRows } from "@/lib/cards/data";
import { defaultCardDesign } from "@/lib/cards/design/presets";

/*
 * Cards print the member's unit chain, read live from the unit's path; card numbers take the unit codes
 * when they are given and keep them: moving the member or renaming a code never renumbers a card.
 */

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
let org: { id: string; timezone: string; financialYearStartMonth: number };
let plan: Awaited<ReturnType<typeof prisma.membershipPlan.create>>;
let ownerId = "";
const units: Record<"north" | "north1" | "south", string> = { north: "", north1: "", south: "" };
const at = (iso: string) => new Date(iso);

async function createUnit(name: string, code: string, parent: { id: string; path: string } | null) {
  const unit = await prisma.orgUnit.create({ data: { organisationId: org.id, parentId: parent?.id ?? null, name, slug: `${code.toLowerCase()}-${suffix}`, code, level: parent ? 1 : 0, path: "pending" } });
  return prisma.orgUnit.update({ where: { id: unit.id }, data: { path: parent ? `${parent.path}/${unit.id}` : unit.id } });
}

async function joinAndApprove(email: string, unitId: string | null, roleId?: string) {
  const { member, term } = await prisma.$transaction(async (tx) => {
    const member = await upsertMember(tx, org.id, { email, name: "Asha Menon", source: "JOIN_FORM", unitId });
    if (roleId) await tx.memberRoleAssignment.create({ data: { organisationId: org.id, memberId: member.id, roleId, isPrimary: true } });
    return { member, term: await openTerm(tx, { org, plan, memberId: member.id, byManager: false, actorUserId: null, now: at("2026-06-15T06:00:00Z") }) };
  });
  await prisma.$transaction((tx) => decideTerm(tx, { org, termId: term.id, action: "approve", actorUserId: ownerId, now: at("2026-06-15T07:00:00Z") }));
  return member.id;
}

const liveCard = (memberId: string) => prisma.memberCard.findFirstOrThrow({ where: { memberId, revokedAt: null } });

beforeAll(async () => {
  const created = await prisma.organisation.create({ data: { name: "Example Network", slug: `hierarchy-${suffix}`, status: "ACTIVE", unitLevels: ["Area", "Unit"] } });
  org = { id: created.id, timezone: created.timezone, financialYearStartMonth: created.financialYearStartMonth };
  plan = await prisma.membershipPlan.create({ data: { organisationId: org.id, name: "Annual member", slug: `annual-${suffix}`, currency: "INR", priceNewMinor: 0, priceRenewalMinor: 0, joinMode: "APPROVAL" } });
  ownerId = (await prisma.user.create({ data: { email: `hierarchy-owner-${suffix}@example.test`, emailVerified: new Date() } })).id;
  const north = await createUnit("North", "N", null);
  const north1 = await createUnit("North 1", "N1", north);
  const south = await createUnit("South", "S", null);
  Object.assign(units, { north: north.id, north1: north1.id, south: south.id });
  await prisma.cardDesign.create({ data: { organisationId: org.id, design: defaultCardDesign({ organisationName: "Example Network", planName: "" }), numberPrefix: "EXN", numberFormat: "{PREFIX}-{U1}-{UNIT}-{SEQ:3}" } });
});

afterAll(async () => {
  vi.restoreAllMocks();
  if (org) {
    await prisma.$executeRaw`DELETE FROM "OutboxMessage" WHERE "payload"->>'organisationId' = ${org.id}`;
    await prisma.memberCard.deleteMany({ where: { organisationId: org.id } });
    await prisma.member.deleteMany({ where: { organisationId: org.id } }).catch(() => undefined);
    await prisma.organisation.delete({ where: { id: org.id } }).catch(() => undefined);
  }
  if (ownerId) await prisma.user.delete({ where: { id: ownerId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe.sequential("cards and the unit hierarchy", () => {
  let memberId = "";
  let roleId = "";

  it("numbers a card from the member's unit codes, NA where there is none", async () => {
    memberId = await joinAndApprove(`north1-${suffix}@example.test`, units.north1);
    const top = await joinAndApprove(`north-${suffix}@example.test`, units.north);
    const none = await joinAndApprove(`none-${suffix}@example.test`, null);
    expect((await liveCard(memberId)).cardNumber).toBe("EXN-N-N1-001");
    expect((await liveCard(top)).cardNumber).toBe("EXN-N-N-002");
    expect((await liveCard(none)).cardNumber).toBe("EXN-NA-NA-003");
  });

  it("loads the member's unit chain with the card, by level name", async () => {
    const loaded = await loadCardForRender((await liveCard(memberId)).id);
    expect(loaded?.holder.units).toEqual([
      { level: 0, levelName: "Area", name: "North", code: "N" },
      { level: 1, levelName: "Unit", name: "North 1", code: "N1" },
    ]);
  });

  it("loads the ancestors for a page of cards in one query", async () => {
    // Every card but the one in North itself, so North has to be loaded as an ancestor.
    const cards = await prisma.memberCard.findMany({ where: { organisationId: org.id, revokedAt: null, member: { OR: [{ unitId: null }, { unitId: { not: units.north } }] } }, include: CARD_INCLUDE });
    const ctx = (await loadCardOrgContext(org.id))!;
    const findMany = vi.spyOn(prisma.orgUnit, "findMany");
    await loadCardUnits(ctx, cards);
    await loadCardUnits(ctx, cards);
    expect(findMany).toHaveBeenCalledTimes(1);
    findMany.mockRestore();
    const chains = cards.map((card) => holderFor(card, ctx).units?.map((unit) => unit.code).join("/"));
    expect(chains.sort()).toEqual(["", "N/N1"]);
  });

  it("keeps the number when the member moves or a code changes, while the card prints the units as they are now", async () => {
    const before = await liveCard(memberId);
    await prisma.member.update({ where: { id: memberId }, data: { unitId: units.south } });
    await prisma.orgUnit.update({ where: { id: units.north1 }, data: { code: "N1X" } });
    const replacement = await prisma.$transaction((tx) => reissueCard(tx, { organisationId: org.id, memberId, planId: plan.id }, ownerId));
    expect(replacement.cardNumber).toBe(before.cardNumber);
    const loaded = await loadCardForRender(replacement.id);
    expect(loaded?.holder.units).toEqual([{ level: 0, levelName: "Area", name: "South", code: "S" }]);
  });

  it("lists each role's card with its status and live cards", async () => {
    roleId = (await prisma.memberRole.create({ data: { organisationId: org.id, name: "Area head" } })).id;
    const other = (await prisma.memberRole.create({ data: { organisationId: org.id, name: "Life member" } })).id;
    await prisma.cardDesign.create({ data: { organisationId: org.id, roleId, design: defaultCardDesign({ organisationName: "Example Network", planName: "" }), numberPrefix: "AH", numberFormat: "{PREFIX}-{U1}-{SEQ}" } });
    const head = await joinAndApprove(`head-${suffix}@example.test`, units.north1, roleId);
    expect((await liveCard(head)).cardNumber).toBe("AH-N-1");
    const rows = await loadRoleCardRows(org.id);
    expect(rows).toEqual([
      { roleId, name: "Area head", ownDesign: true, status: "approved", numberFormat: "{PREFIX}-{U1}-{SEQ}", liveCards: 1 },
      { roleId: other, name: "Life member", ownDesign: false, status: "organisation", numberFormat: null, liveCards: 0 },
    ]);
  });
});
