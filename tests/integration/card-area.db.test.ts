import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (mocks.userId ? { user: { id: mocks.userId } } : null) }));
vi.mock("@/lib/reauth", () => ({ hasRecentAuthentication: async () => true }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { approveCardDesign, discardCardDraft, revertToOrganisationCardDesign, saveCardDesign } from "@/app/actions/card-design";
import { listCardDesignVersions } from "@/app/actions/card-versions";
import { setUnitContact } from "@/app/actions/unit-contact";
import { decideTerm, openTerm, upsertMember } from "@/lib/membership/service";
import { reissueCard } from "@/lib/cards/issue";
import { designFor, loadCardOrgContext } from "@/lib/cards/data";
import { defaultCardDesign } from "@/lib/cards/design/presets";
import { findDesignScope } from "@/lib/cards/designerAccess";
import { addStaff } from "../helpers/staff";

/*
 * Area cards: an area (unit) can have its own card design, numbering series and contact details. Designs are
 * scoped to one organisation, one scope at a time, and an area design numbers its members' new cards from its own
 * running series.
 */

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const json = (value: unknown) => value as Prisma.InputJsonValue;
const names = { organisationName: "Example Network", planName: "" };
let org: { id: string; slug: string; timezone: string; financialYearStartMonth: number };
let other: { id: string; slug: string };
let plan: Awaited<ReturnType<typeof prisma.membershipPlan.create>>;
let ownerId = "";
let outsiderId = "";
const units: Record<"north" | "north1" | "south" | "old" | "foreign", string> = { north: "", north1: "", south: "", old: "", foreign: "" };

async function createUnit(organisationId: string, name: string, code: string, parent: { id: string; path: string } | null, archivedAt: Date | null = null) {
  const unit = await prisma.orgUnit.create({ data: { organisationId, parentId: parent?.id ?? null, name, slug: `${code.toLowerCase()}-${suffix}`, code, level: parent ? 1 : 0, path: "pending", archivedAt } });
  return prisma.orgUnit.update({ where: { id: unit.id }, data: { path: parent ? `${parent.path}/${unit.id}` : unit.id } });
}

async function join(email: string, unitId: string | null) {
  const { member, term } = await prisma.$transaction(async (tx) => {
    const member = await upsertMember(tx, org.id, { email, name: "Asha Menon", source: "JOIN_FORM", unitId });
    return { member, term: await openTerm(tx, { org, plan, memberId: member.id, byManager: false, actorUserId: null }) };
  });
  await prisma.$transaction((tx) => decideTerm(tx, { org, termId: term.id, action: "approve", actorUserId: ownerId }));
  return { memberId: member.id, number: (await prisma.memberCard.findFirstOrThrow({ where: { memberId: member.id, revokedAt: null } })).cardNumber };
}

const areaRow = (unitId: string, numberPrefix: string, numberFormat = "{PREFIX}-{SEQ:3}", live = true) =>
  prisma.cardDesign.create({ data: { organisationId: org.id, unitId, design: live ? json(defaultCardDesign(names, "night")) : undefined, numberPrefix, numberFormat, approvedAt: live ? new Date() : null } });

beforeAll(async () => {
  const created = await prisma.organisation.create({ data: { name: "Example Network", slug: `areas-${suffix}`, status: "ACTIVE", unitLevels: ["Area", "Unit"] } });
  org = { id: created.id, slug: created.slug, timezone: created.timezone, financialYearStartMonth: created.financialYearStartMonth };
  const second = await prisma.organisation.create({ data: { name: "Other Guild", slug: `areas-other-${suffix}`, status: "ACTIVE", unitLevels: ["Area"] } });
  other = { id: second.id, slug: second.slug };
  plan = await prisma.membershipPlan.create({ data: { organisationId: org.id, name: "Annual member", slug: `annual-${suffix}`, currency: "INR", priceNewMinor: 0, priceRenewalMinor: 0, joinMode: "APPROVAL" } });
  ownerId = (await prisma.user.create({ data: { email: `areas-owner-${suffix}@example.test`, emailVerified: new Date(), mfaEnabledAt: new Date() } })).id;
  outsiderId = (await prisma.user.create({ data: { email: `areas-outsider-${suffix}@example.test`, emailVerified: new Date(), mfaEnabledAt: new Date() } })).id;
  await addStaff(org.id, ownerId, "OWNER");
  await addStaff(other.id, outsiderId, "OWNER");
  const north = await createUnit(org.id, "North", "N", null);
  const north1 = await createUnit(org.id, "North 1", "N1", north);
  const south = await createUnit(org.id, "South", "S", null);
  const old = await createUnit(org.id, "Old", "OLD", null, new Date());
  const foreign = await createUnit(other.id, "Elsewhere", "E", null);
  Object.assign(units, { north: north.id, north1: north1.id, south: south.id, old: old.id, foreign: foreign.id });
  await prisma.cardDesign.create({ data: { organisationId: org.id, design: json(defaultCardDesign(names, "community")), numberPrefix: "EXN", numberFormat: "{PREFIX}-{SEQ:4}", approvedAt: new Date() } });
});

afterAll(async () => {
  for (const id of [org?.id, other?.id].filter(Boolean)) {
    await prisma.$executeRaw`DELETE FROM "OutboxMessage" WHERE "payload"->>'organisationId' = ${id}`;
    await prisma.memberCard.deleteMany({ where: { organisationId: id } });
    await prisma.member.deleteMany({ where: { organisationId: id } }).catch(() => undefined);
    await prisma.teamMember.deleteMany({ where: { organisationId: id } });
    await prisma.organisation.delete({ where: { id } }).catch(() => undefined);
  }
  await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: [ownerId, outsiderId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, outsiderId] } } });
  await prisma.$disconnect();
});

describe.sequential("area design scope", () => {
  it("allows one scope at a time at the database too", async () => {
    await expect(prisma.cardDesign.create({ data: { organisationId: org.id, planId: plan.id, unitId: units.south, numberPrefix: "BAD" } })).rejects.toThrow();
    await expect(prisma.cardDesign.create({ data: { organisationId: org.id, unitId: units.foreign, numberPrefix: "BAD" } })).rejects.toThrow();
  });

  it("refuses an area from another organisation, an archived one, and combined scopes", async () => {
    expect(await findDesignScope(org.id, null, null, units.foreign)).toBeNull();
    expect(await findDesignScope(org.id, null, null, units.old)).toBeNull();
    expect(await findDesignScope(org.id, plan.id, null, units.south)).toBeNull();
    expect(await findDesignScope(org.id, null, null, units.south)).toMatchObject({ unit: { id: units.south }, where: { unitId: units.south, planId: null, roleId: null } });

    mocks.userId = ownerId;
    const design = defaultCardDesign(names, "student");
    const save = (extra: Record<string, unknown>) => saveCardDesign({ organisationSlug: org.slug, planId: null, design, ...extra });
    expect(await save({ unitId: units.foreign })).toEqual({ ok: false, error: "That area no longer exists." });
    expect(await save({ unitId: units.old })).toEqual({ ok: false, error: "That area no longer exists." });
    expect(await save({ unitId: units.south, planId: plan.id })).toEqual({ ok: false, error: "Invalid request." });
    expect(await save({ unitId: units.south, roleId: "someone" })).toEqual({ ok: false, error: "Invalid request." });
    expect(await approveCardDesign({ organisationSlug: org.slug, planId: null, unitId: units.old })).toMatchObject({ ok: false });
    expect(await revertToOrganisationCardDesign({ organisationSlug: org.slug, planId: plan.id, unitId: units.south })).toEqual({ ok: false, error: "Invalid request." });
    expect(await listCardDesignVersions({ organisationSlug: org.slug, planId: null, unitId: units.foreign })).toEqual({ ok: false, error: "Not found." });
    expect(await prisma.cardDesign.count({ where: { organisationId: org.id, unitId: { not: null } } })).toBe(0);
  });

  it("keeps another organisation's staff out", async () => {
    mocks.userId = outsiderId;
    const result = await saveCardDesign({ organisationSlug: org.slug, planId: null, unitId: units.south, design: defaultCardDesign(names, "student") });
    expect(result.ok).toBe(false);
    expect(await prisma.cardDesign.count({ where: { organisationId: org.id, unitId: { not: null } } })).toBe(0);
  });

  it("saves a draft that stays off cards until the owner approves it, then draws it for the area", async () => {
    mocks.userId = ownerId;
    const saved = await saveCardDesign({ organisationSlug: org.slug, planId: null, unitId: units.north, design: defaultCardDesign(names, "student"), numberPrefix: "NOR", numberFormat: "{PREFIX}-{SEQ:3}" });
    expect(saved.ok).toBe(true);
    const row = await prisma.cardDesign.findFirstOrThrow({ where: { organisationId: org.id, unitId: units.north } });
    expect(row).toMatchObject({ design: null, numberPrefix: "NOR", planId: null, roleId: null });
    expect(row.draft).not.toBeNull();
    expect(designFor((await loadCardOrgContext(org.id))!, { id: "x", name: "Plan" }, null, { path: (await prisma.orgUnit.findUniqueOrThrow({ where: { id: units.north1 } })).path }).source).toBe("organisation");
    expect(await saveCardDesign({ organisationSlug: org.slug, planId: null, unitId: units.north, design: defaultCardDesign(names, "student"), numberPrefix: "EXN" })).toMatchObject({ ok: false, error: expect.stringContaining("area") });

    expect(await approveCardDesign({ organisationSlug: org.slug, planId: null, unitId: units.north })).toEqual({ ok: true });
    const ctx = (await loadCardOrgContext(org.id))!;
    const below = await prisma.orgUnit.findUniqueOrThrow({ where: { id: units.north1 } });
    expect(designFor(ctx, { id: "x", name: "Plan" }, null, below)).toMatchObject({ source: "area", design: { preset: "student" } });
    expect(designFor(ctx, { id: "x", name: "Plan" }, null, await prisma.orgUnit.findUniqueOrThrow({ where: { id: units.south } })).source).toBe("organisation");
    expect(await prisma.auditEvent.count({ where: { organisationId: org.id, action: "CARD_DESIGN_APPROVED" } })).toBe(1);
  });

  it("discards a draft and reverts an area design without touching the organisation's", async () => {
    mocks.userId = ownerId;
    await saveCardDesign({ organisationSlug: org.slug, planId: null, unitId: units.south, design: defaultCardDesign(names, "corporate") });
    expect(await discardCardDraft({ organisationSlug: org.slug, planId: null, unitId: units.south })).toEqual({ ok: true });
    expect(await prisma.cardDesign.count({ where: { organisationId: org.id, unitId: units.south } })).toBe(0);
    expect(await revertToOrganisationCardDesign({ organisationSlug: org.slug, planId: null, unitId: units.north })).toEqual({ ok: true });
    expect(await prisma.cardDesign.count({ where: { organisationId: org.id, unitId: units.north } })).toBe(0);
    expect(await prisma.cardDesign.count({ where: { organisationId: org.id, unitId: null, planId: null, roleId: null } })).toBe(1);
  });
});

describe.sequential("area numbering", () => {
  it("numbers from the nearest area's own series, else the organisation's, and a move keeps the number", async () => {
    await areaRow(units.north, "NOR");
    await areaRow(units.south, "SOU", "{PREFIX}-{SEQ:2}");
    const first = await join(`n1-${suffix}@example.test`, units.north1);
    expect(first.number).toBe("NOR-001");
    expect((await join(`n2-${suffix}@example.test`, units.north)).number).toBe("NOR-002");
    expect((await join(`s1-${suffix}@example.test`, units.south)).number).toBe("SOU-01");
    expect((await join(`s2-${suffix}@example.test`, units.south)).number).toBe("SOU-02");
    // No unit: the organisation default, in its own series.
    expect((await join(`none-${suffix}@example.test`, null)).number).toBe("EXN-0001");

    // Moving to another area keeps the number, even when the card is reissued.
    await prisma.member.update({ where: { id: first.memberId }, data: { unitId: units.south } });
    await prisma.$transaction((tx) => reissueCard(tx, { organisationId: org.id, memberId: first.memberId, planId: plan.id }, ownerId));
    expect((await prisma.memberCard.findFirstOrThrow({ where: { memberId: first.memberId, revokedAt: null } })).cardNumber).toBe("NOR-001");
  });

  it("changing a design's numbering affects only new numbers, and a draft area design numbers nothing", async () => {
    await prisma.cardDesign.update({ where: { organisationId_unitId: { organisationId: org.id, unitId: units.north } }, data: { numberPrefix: "NTH" } });
    expect((await join(`n3-${suffix}@example.test`, units.north1)).number).toBe("NTH-003");
    expect(await prisma.memberCard.count({ where: { organisationId: org.id, cardNumber: "NOR-001" } })).toBeGreaterThan(0);
  });
});

describe.sequential("area contact details", () => {
  const set = (extra: Record<string, unknown>) => setUnitContact({ organisationSlug: org.slug, unitId: units.north, contactEmail: "", contactPhone: "", website: "", ...extra });

  it("saves valid details, clears empty ones and audits field names only", async () => {
    mocks.userId = ownerId;
    expect(await set({ contactEmail: "North@Example.org", contactPhone: "+91 484 123 4567", website: "https://north.example.org" })).toEqual({
      ok: true,
      data: { contactEmail: "north@example.org", contactPhone: "+91 484 123 4567", website: "https://north.example.org" },
    });
    expect(await prisma.orgUnit.findUniqueOrThrow({ where: { id: units.north } })).toMatchObject({ contactEmail: "north@example.org", website: "https://north.example.org" });
    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { organisationId: org.id, action: "UNIT_CONTACT_CHANGED" } });
    expect(audit.metadata).toEqual({ fields: "contactEmail,contactPhone,website" });
    expect(await set({ contactPhone: "", contactEmail: "north@example.org", website: "https://north.example.org" })).toMatchObject({ ok: true, data: { contactPhone: null } });
    expect((await prisma.orgUnit.findUniqueOrThrow({ where: { id: units.north } })).contactPhone).toBeNull();
  });

  it("refuses bad input without saving", async () => {
    mocks.userId = ownerId;
    const before = await prisma.orgUnit.findUniqueOrThrow({ where: { id: units.north } });
    const bad = await set({ contactEmail: "nope", contactPhone: "abc", website: "javascript:alert(1)" });
    expect(bad).toMatchObject({ ok: false, fieldErrors: { contactEmail: expect.any(Array), contactPhone: expect.any(Array), website: expect.any(Array) } });
    expect(await set({ website: "ftp://example.org" })).toMatchObject({ ok: false });
    expect(await prisma.orgUnit.findUniqueOrThrow({ where: { id: units.north } })).toEqual(before);
  });

  it("refuses another organisation's unit, an unknown one and staff of another organisation", async () => {
    mocks.userId = ownerId;
    expect(await set({ unitId: units.foreign })).toEqual({ ok: false, error: "Unit not found." });
    mocks.userId = outsiderId;
    expect(await set({ contactEmail: "x@example.org" })).toMatchObject({ ok: false });
    expect((await prisma.orgUnit.findUniqueOrThrow({ where: { id: units.north } })).contactEmail).toBe("north@example.org");
  });
});
