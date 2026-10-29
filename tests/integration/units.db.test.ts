import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (mocks.userId ? { user: { id: mocks.userId } } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { createUnit, moveUnit, setUnitArchived, setUnitLevels, updateUnit } from "@/app/actions/units";
import { loadOrgUnitView } from "@/lib/views/app__dashboard__orgSlug__settings__structure__unitId__page";
import { loadOrgStructureView } from "@/lib/views/app__dashboard__orgSlug__settings__structure__page";
import { addStaff } from "../helpers/staff";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
let org: { id: string; slug: string };
let other: { id: string; slug: string };
let owner: string;
let scoped: string;

async function staff(name: string) {
  return prisma.user.create({ data: { email: `${name}-${suffix}@example.test`, name, emailVerified: new Date(), mfaEnabledAt: new Date() } });
}

async function unit(name: string, parentId: string | null = null, code?: string) {
  mocks.userId = owner;
  const result = await createUnit({ organisationSlug: org.slug, name, slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${randomUUID().slice(0, 6)}`, parentId, code });
  if (!result.ok) throw new Error(result.error);
  return result.data!;
}

const row = (id: string) => prisma.orgUnit.findUniqueOrThrow({ where: { id } });

beforeAll(async () => {
  const created = await prisma.organisation.create({ data: { name: "Example Network", slug: `example-network-${suffix}`, status: "ACTIVE", unitLevels: ["Area", "Unit", "Ward"] } });
  org = { id: created.id, slug: created.slug };
  owner = (await staff("owner")).id;
  scoped = (await staff("scoped")).id;
  await addStaff(org.id, owner, "OWNER");
  const second = await prisma.organisation.create({ data: { name: "Other Network", slug: `other-network-${suffix}`, status: "ACTIVE", unitLevels: ["Area", "Unit"] } });
  other = { id: second.id, slug: second.slug };
});

afterAll(async () => {
  for (const entry of [org, other].filter(Boolean)) {
    await prisma.teamMember.deleteMany({ where: { organisationId: entry.id } });
    await prisma.orgUnit.updateMany({ where: { organisationId: entry.id }, data: { parentId: null } });
    await prisma.organisation.delete({ where: { id: entry.id } }).catch(() => undefined);
  }
  await prisma.user.deleteMany({ where: { id: { in: [owner, scoped].filter(Boolean) } } });
  await prisma.$disconnect();
});

describe.sequential("unit actions", () => {
  it("makes a code from the name, and a free one on a clash", async () => {
    const first = await unit("Thiruvananthapuram");
    const second = await unit("Thiruvalla");
    expect(first.code).toBe("THIRUV");
    expect(second.code).toBe("THIRU2");
    const named = await unit("Kollam", null, "klm");
    expect(named.code).toBe("KLM");
  });

  it("refuses a code another unit uses, and edits name and code together", async () => {
    mocks.userId = owner;
    const area = await unit("Alappuzha", null, "ALP");
    expect(await createUnit({ organisationSlug: org.slug, name: "Alappuzha South", slug: `alp-south-${suffix}`, code: "ALP" })).toMatchObject({ ok: false, fieldErrors: { code: ["Already used"] } });
    expect(await updateUnit({ organisationSlug: org.slug, unitId: area.unitId, name: "Alleppey", code: "alpy" })).toEqual({ ok: true });
    expect(await row(area.unitId)).toMatchObject({ name: "Alleppey", code: "ALPY" });
    expect(await updateUnit({ organisationSlug: org.slug, unitId: area.unitId, name: "Alleppey", code: "TOO-LONG" })).toMatchObject({ ok: false });
  });

  it("moves a unit and its whole subtree to another parent on the same level", async () => {
    const north = await unit("North", null, "NTH");
    const south = await unit("South", null, "STH");
    const ward = await unit("Ward A", (await unit("Town", north.unitId, "TWN")).unitId, "WRDA");
    const town = (await row(ward.unitId)).parentId!;
    mocks.userId = owner;
    expect(await moveUnit({ organisationSlug: org.slug, unitId: town, parentId: south.unitId })).toEqual({ ok: true });
    expect((await row(town)).path).toBe(`${south.unitId}/${town}`);
    expect((await row(ward.unitId)).path).toBe(`${south.unitId}/${town}/${ward.unitId}`);
    expect((await row(ward.unitId)).level).toBe(2);
  });

  it("refuses moves across levels, of top-level units and to archived parents", async () => {
    const east = await unit("East", null, "EST");
    const west = await unit("West", null, "WST");
    const village = await unit("Village", east.unitId, "VLG");
    const hamlet = await unit("Hamlet", village.unitId, "HML");
    mocks.userId = owner;
    expect(await moveUnit({ organisationSlug: org.slug, unitId: hamlet.unitId, parentId: west.unitId })).toMatchObject({ ok: false, error: "Move units only between parents on the same level." });
    expect(await moveUnit({ organisationSlug: org.slug, unitId: east.unitId, parentId: west.unitId })).toMatchObject({ ok: false });
    await setUnitArchived({ organisationSlug: org.slug, unitId: west.unitId, archived: true });
    expect(await moveUnit({ organisationSlug: org.slug, unitId: village.unitId, parentId: west.unitId })).toMatchObject({ ok: false, error: "Choose a unit that isn't archived." });
  });

  it("archives a subtree and restores only when the unit above is live", async () => {
    const area = await unit("Kannur", null, "KNR");
    const town = await unit("Thalassery", area.unitId, "TLY");
    mocks.userId = owner;
    expect(await setUnitArchived({ organisationSlug: org.slug, unitId: area.unitId, archived: true })).toEqual({ ok: true });
    expect((await row(town.unitId)).archivedAt).not.toBeNull();
    expect(await setUnitArchived({ organisationSlug: org.slug, unitId: town.unitId, archived: false })).toMatchObject({ ok: false, error: "Restore the unit above it first." });
    expect(await setUnitArchived({ organisationSlug: org.slug, unitId: area.unitId, archived: false })).toEqual({ ok: true });
  });

  it("keeps levels that live units still use", async () => {
    const area = await unit("Wayanad", null, "WYD");
    await unit("Kalpetta", area.unitId, "KPT");
    mocks.userId = owner;
    expect(await setUnitLevels({ organisationSlug: org.slug, levels: ["Area"] })).toMatchObject({ ok: false });
  });

  it("gives every concurrent create a correct path", async () => {
    const area = await unit("Kozhikode", null, "KKD");
    mocks.userId = owner;
    const results = await Promise.all(Array.from({ length: 6 }, (_, index) => createUnit({ organisationSlug: org.slug, name: `Calicut ${index}`, slug: `calicut-${index}-${suffix}`, parentId: area.unitId })));
    expect(results.every((result) => result.ok)).toBe(true);
    const children = await prisma.orgUnit.findMany({ where: { organisationId: org.id, parentId: area.unitId } });
    expect(children).toHaveLength(6);
    for (const child of children) expect(child.path).toBe(`${area.unitId}/${child.id}`);
    expect(new Set(children.map((child) => child.code)).size).toBe(6);
  });

  it("keeps staff limited to a unit out of structure changes", async () => {
    const area = await unit("Idukki", null, "IDK");
    await addStaff(org.id, scoped, "ADMIN", area.unitId);
    mocks.userId = scoped;
    expect(await createUnit({ organisationSlug: org.slug, name: "Thodupuzha", slug: `thodupuzha-${suffix}`, parentId: area.unitId })).toMatchObject({ ok: false });
    expect(await moveUnit({ organisationSlug: org.slug, unitId: area.unitId, parentId: area.unitId })).toMatchObject({ ok: false });
  });

  it("never reaches another organisation's units", async () => {
    const foreignArea = await prisma.orgUnit.create({ data: { organisationId: other.id, name: "Foreign", slug: `foreign-${suffix}`, code: "FRN", path: "pending" } });
    await prisma.orgUnit.update({ where: { id: foreignArea.id }, data: { path: foreignArea.id } });
    const foreignUnit = await prisma.orgUnit.create({ data: { organisationId: other.id, parentId: foreignArea.id, name: "Foreign 1", slug: `foreign-1-${suffix}`, code: "FRN1", level: 1, path: `${foreignArea.id}/pending` } });
    const mine = await unit("Mine", null, "MINE");
    const mineChild = await unit("Mine 1", mine.unitId, "MINE1");
    mocks.userId = owner;
    expect(await createUnit({ organisationSlug: org.slug, name: "Sneaky", slug: `sneaky-${suffix}`, parentId: foreignArea.id })).toMatchObject({ ok: false, error: "The parent unit no longer exists." });
    expect(await moveUnit({ organisationSlug: org.slug, unitId: mineChild.unitId, parentId: foreignArea.id })).toMatchObject({ ok: false });
    expect(await moveUnit({ organisationSlug: org.slug, unitId: foreignUnit.id, parentId: mine.unitId })).toMatchObject({ ok: false, error: "Unit not found." });
    expect(await setUnitArchived({ organisationSlug: org.slug, unitId: foreignArea.id, archived: true })).toMatchObject({ ok: false, error: "Unit not found." });
    expect(await updateUnit({ organisationSlug: org.slug, unitId: foreignArea.id, name: "Taken", code: "TKN" })).toMatchObject({ ok: false, error: "Unit not found." });
    // Acting on the other organisation itself needs a place on its team.
    expect(await setUnitArchived({ organisationSlug: other.slug, unitId: foreignArea.id, archived: true })).toMatchObject({ ok: false });
    await expect(loadOrgUnitView({ params: Promise.resolve({ orgSlug: org.slug, unitId: foreignArea.id }) })).rejects.toThrow();
    const untouched = await prisma.orgUnit.findUniqueOrThrow({ where: { id: foreignArea.id } });
    expect(untouched).toMatchObject({ name: "Foreign", code: "FRN", archivedAt: null });
    expect((await prisma.orgUnit.findUniqueOrThrow({ where: { id: mineChild.unitId } })).parentId).toBe(mine.unitId);
    // Staff limited to another unit can't open this one's page either.
    mocks.userId = scoped;
    await expect(loadOrgUnitView({ params: Promise.resolve({ orgSlug: org.slug, unitId: mine.unitId }) })).rejects.toThrow();
  });

  it("keeps a create under a unit that is moving at the same time on the right path", async () => {
    const from = await unit("Race From", null, "RFROM");
    const to = await unit("Race To", null, "RTO");
    const town = await unit("Race Town", from.unitId, "RTOWN");
    mocks.userId = owner;
    const [moved, created] = await Promise.all([
      moveUnit({ organisationSlug: org.slug, unitId: town.unitId, parentId: to.unitId }),
      createUnit({ organisationSlug: org.slug, name: "Race Ward", slug: `race-ward-${suffix}`, code: "RWARD", parentId: town.unitId }),
    ]);
    expect(moved).toEqual({ ok: true });
    expect(created.ok).toBe(true);
    const ward = await prisma.orgUnit.findFirstOrThrow({ where: { organisationId: org.id, code: "RWARD" } });
    expect(ward.path).toBe(`${to.unitId}/${town.unitId}/${ward.id}`);
  });

  it("shows staff limited to a unit only their part of the tree", async () => {
    const idukki = await prisma.orgUnit.findFirstOrThrow({ where: { organisationId: org.id, code: "IDK" } });
    await unit("Munnar", idukki.id, "MNR");
    mocks.userId = scoped;
    const view = await loadOrgStructureView({ params: Promise.resolve({ orgSlug: org.slug }) });
    expect(view.canEdit).toBe(false);
    expect(view.units.map((entry) => entry.code).sort()).toEqual(["IDK", "MNR"]);
    const page = await loadOrgUnitView({ params: Promise.resolve({ orgSlug: org.slug, unitId: (await prisma.orgUnit.findFirstOrThrow({ where: { organisationId: org.id, code: "MNR" } })).id }) });
    expect(page.trail.map((entry) => entry.name)).toEqual(["Idukki"]);
  });

  it("refuses to restore units deeper than the levels left", async () => {
    const shallow = await prisma.organisation.create({ data: { name: "Shallow Network", slug: `shallow-${suffix}`, status: "ACTIVE", unitLevels: ["Area", "Unit"] } });
    await addStaff(shallow.id, owner, "OWNER");
    mocks.userId = owner;
    const area = await createUnit({ organisationSlug: shallow.slug, name: "Upper", slug: `upper-${suffix}`, code: "UPR" });
    if (!area.ok) throw new Error(area.error);
    const areaId = area.data!.unitId;
    const child = await createUnit({ organisationSlug: shallow.slug, name: "Lower", slug: `lower-${suffix}`, code: "LWR", parentId: areaId });
    expect(child.ok).toBe(true);
    expect(await setUnitArchived({ organisationSlug: shallow.slug, unitId: areaId, archived: true })).toEqual({ ok: true });
    expect(await setUnitLevels({ organisationSlug: shallow.slug, levels: ["Area"] })).toEqual({ ok: true });
    expect(await setUnitArchived({ organisationSlug: shallow.slug, unitId: areaId, archived: false })).toMatchObject({ ok: false, error: "Some units under it sit deeper than your levels. Add the level back first." });
    await prisma.teamMember.deleteMany({ where: { organisationId: shallow.id } });
    await prisma.orgUnit.updateMany({ where: { organisationId: shallow.id }, data: { parentId: null } });
    await prisma.organisation.delete({ where: { id: shallow.id } });
  });
});
