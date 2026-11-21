import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resolveArea, loadAreaEntries } from "@/lib/publicPage/areaData";
import { loadPublicContent } from "@/lib/publicPage/content";
import { statsForSection } from "@/lib/publicPage/blockData";
import { loadLiveStats, loadStatsCatalogue } from "@/lib/publicPage/liveStats";
import { listPageVersions, loadPageVersion, loadStoredPage, MAX_PAGE_VERSIONS, publishPage, restorePageVersion, savePageDraft } from "@/lib/publicPage/server";
import { newSection, readPageDocument, type PageDocument } from "@/lib/publicPage/sections";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const DAY = 86_400_000;
const settings = { financialYearStartMonth: 4, timezone: "Asia/Kolkata", unitLevels: ["Area", "Branch"] };
let org = { id: "", slug: "", status: "ACTIVE", unitLevels: settings.unitLevels, timezone: settings.timezone, financialYearStartMonth: 4, contactEmail: "org@example.test", contactPhone: null as string | null, website: null as string | null };
let otherOrgId = "";
let north = { id: "", path: "" };
let south = { id: "", path: "" };
let ward = { id: "", path: "" };
let planAll = "";
let planNorthOnly = "";
let userId = "";
let numbered = 0;

async function unit(organisationId: string, name: string, code: string, parent: { id: string; path: string } | null, extra: { contactEmail?: string; archivedAt?: Date } = {}) {
  const created = await prisma.orgUnit.create({ data: { organisationId, name, slug: `${name}-${code}`.toLowerCase(), code, level: parent ? 1 : 0, parentId: parent?.id ?? null, path: "pending", ...extra } });
  const path = parent ? `${parent.path}/${created.id}` : created.id;
  await prisma.orgUnit.update({ where: { id: created.id }, data: { path } });
  return { id: created.id, path };
}

async function members(count: number, unitId: string | null, prefix: string, createdAt = new Date(Date.now() - 400 * DAY)) {
  for (let index = 0; index < count; index += 1) {
    const created = await prisma.member.create({ data: { organisationId: org.id, memberNumber: ++numbered, name: `${prefix} ${index}`, email: `${prefix}${index}-${suffix}@example.test`, unitId, createdAt } });
    await prisma.membershipTerm.create({ data: { organisationId: org.id, memberId: created.id, planId: planAll, currency: "INR", priceMinor: 0, status: "ACTIVE", startsAt: new Date(Date.now() - 30 * DAY) } });
  }
}

beforeAll(async () => {
  const created = await prisma.organisation.create({ data: { name: "Areas", slug: `areas-${suffix}`, status: "ACTIVE", unitLevels: settings.unitLevels } });
  org = { ...org, id: created.id, slug: created.slug };
  otherOrgId = (await prisma.organisation.create({ data: { name: "Other", slug: `other-${suffix}`, status: "ACTIVE" } })).id;
  userId = (await prisma.user.create({ data: { email: `editor-${suffix}@example.test`, name: "Editor" } })).id;
  north = await unit(org.id, "North", "NORTH", null, { contactEmail: "north@example.test" });
  south = await unit(org.id, "South", "SOUTH", null);
  ward = await unit(org.id, "Ward", "WARD1", north);
  await unit(org.id, "Old", "OLD", null, { archivedAt: new Date() });
  await unit(otherOrgId, "Foreign", "FRGN", null);
  planAll = (await prisma.membershipPlan.create({ data: { organisationId: org.id, name: "Open", slug: "open", joinMode: "OPEN", sortOrder: 0 } })).id;
  const limited = await prisma.membershipPlan.create({ data: { organisationId: org.id, name: "North only", slug: "north-only", joinMode: "OPEN", allUnits: false, sortOrder: 1 } });
  planNorthOnly = limited.id;
  await prisma.planUnit.create({ data: { organisationId: org.id, planId: limited.id, unitId: north.id } });
  await members(6, ward.id, "ward");
  await members(4, north.id, "north");
  await members(3, south.id, "south");
  await members(6, south.id, "recent", new Date(Date.now() - 2 * DAY));
});

afterAll(async () => {
  await prisma.planUnit.deleteMany({ where: { organisationId: org.id } });
  await prisma.organisation.deleteMany({ where: { id: { in: [org.id, otherOrgId] } } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
});

const statsDoc = (metrics: unknown[]): PageDocument => readPageDocument({ sections: [{ ...newSection("liveStats", "stats00001"), metrics }] });

describe("live numbers", () => {
  it("counts the organisation, hides what is under 5 and never names anyone", async () => {
    const data = await loadLiveStats(org.id, statsDoc([{ kind: "total" }, { kind: "byArea" }, { kind: "byPlan" }]), null, settings);
    const [total, byArea, byPlan] = data!.stats00001!;
    expect(total!.value).toBe(19);
    // North (10 under it) shows; South (9) shows. Both are 5 or more, so both stay.
    expect(byArea!.rows).toEqual([{ label: "North", count: 10 }, { label: "South", count: 9 }]);
    expect(byPlan!.rows).toEqual([{ label: "Open", count: 19 }]);
    expect(JSON.stringify(data)).not.toMatch(/example\.test|ward 0/i);
  });

  it("scopes everything to an area's subtree", async () => {
    const data = await loadLiveStats(org.id, statsDoc([{ kind: "total" }, { kind: "byArea" }]), north.path, settings, 0);
    const [total, byArea] = data!.stats00001!;
    expect(total!.value).toBe(10);
    // Only the Ward below North has members; the 4 in North itself are not a row. 6 is shown.
    expect(byArea!.rows).toEqual([{ label: "Ward", count: 6 }]);
    const south4 = await loadLiveStats(org.id, statsDoc([{ kind: "total" }]), ward.path, settings, 1);
    expect(south4!.stats00001![0]!.value).toBe(6);
  });

  it("suppresses a total under 5 and computes growth only from large enough sides", async () => {
    const tiny = await unit(org.id, "Tiny", "TINY", null);
    await members(3, tiny.id, "tiny");
    const data = await loadLiveStats(org.id, statsDoc([{ kind: "total" }, { kind: "joinsThisYear" }, { kind: "growth", days: 30 }]), tiny.path, settings, 0);
    expect(data!.stats00001!.map((result) => result.value)).toEqual([null, null, null]);
    const wide = await loadLiveStats(org.id, statsDoc([{ kind: "growth", days: 30 }]), null, settings);
    expect(wide!.stats00001![0]).toMatchObject({ value: 6, percent: 38 });
  });

  it("counts by a grouping and drops an unknown one", async () => {
    const grouping = await prisma.orgGrouping.create({ data: { organisationId: org.id, key: "team", name: "Team" } });
    const value = await prisma.orgGroupingValue.create({ data: { organisationId: org.id, groupingId: grouping.id, label: "Red", code: "RED", path: "pending" } });
    await prisma.orgGroupingValue.update({ where: { id: value.id }, data: { path: value.id } });
    const people = await prisma.member.findMany({ where: { organisationId: org.id, unitId: south.id }, take: 5 });
    for (const person of people) await prisma.memberGroupingValue.create({ data: { organisationId: org.id, memberId: person.id, groupingId: grouping.id, valueId: value.id } });
    const data = await loadLiveStats(org.id, statsDoc([{ kind: "byGrouping", groupingId: grouping.id }, { kind: "byGrouping", groupingId: "nope123" }]), null, settings);
    expect(data!.stats00001).toHaveLength(1);
    expect(data!.stats00001![0]!.rows).toEqual([{ label: "Red", count: 5 }]);
  });
});

describe("stats catalogue", () => {
  it("offers every metric so the editor can compose a block live", async () => {
    const catalogue = await loadStatsCatalogue(org.id, [], settings);
    expect(catalogue.map((result) => result.kind)).toEqual(["total", "joinsThisYear", "byArea", "byPlan", "growth", "growth", "growth"]);
    const picked = statsForSection({ metrics: [{ kind: "growth", days: 365, label: "Last year", groupingId: "" }, { kind: "total", label: "", groupingId: "", days: 90 }] }, catalogue);
    expect(picked.map((result) => result.label)).toEqual(["Last year", "Total members"]);
  });
});

describe("area routes", () => {
  it("resolves a live area with its trail and inherited contact", async () => {
    const { area, path } = await resolveArea(org, "ward1");
    expect(path).toBe(ward.path);
    expect(area.trail.map((step) => step.code)).toEqual(["NORTH", "WARD1"]);
    expect(area.contact.email).toBe("north@example.test");
    expect(area.ownContact.phone).toBeNull();
  });

  it("is a 404 for unknown, archived, foreign and malformed codes", async () => {
    for (const code of ["NOPE", "OLD", "FRGN", "bad code!", ""]) await expect(resolveArea(org, code)).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("shows only the plans offered to the area and carries area-scoped content", async () => {
    const page = { sections: [newSection("plans", "plans00001"), { ...newSection("liveStats", "stats00001"), metrics: [{ kind: "total" }] }, newSection("contact", "contact001")] };
    await publishPage(org.id, readPageDocument(page), userId);
    const forNorth = await loadPublicContent(org, await resolveArea(org, "NORTH"));
    expect(forNorth.plans.map((plan) => plan.slug)).toEqual(["open", "north-only"]);
    expect(forNorth.liveStats!.stats00001![0]!.value).toBe(10);
    expect(forNorth.counts).toBeNull();
    const forSouth = await loadPublicContent(org, await resolveArea(org, "SOUTH"));
    expect(forSouth.plans.map((plan) => plan.slug)).toEqual(["open"]);
    const contact = forNorth.page!.sections.find((section) => section.type === "contact");
    expect(contact?.type === "contact" && contact.email).toBe("north@example.test");
    const whole = await loadPublicContent(org, null);
    expect(whole.plans).toHaveLength(2);
    expect(whole.liveStats!.stats00001![0]!.value).toBe(22);
  });

  it("lists areas with their join plans and never an archived or foreign one", async () => {
    const entries = await loadAreaEntries(org, true);
    expect(entries.map((entry) => entry.code)).toEqual(["NORTH", "SOUTH", "TINY", "WARD1"]);
    expect(entries.find((entry) => entry.code === "NORTH")!.joinPlans).toEqual(["open", "north-only"]);
    expect(entries.find((entry) => entry.code === "SOUTH")!.joinPlans).toEqual(["open"]);
    expect((await loadAreaEntries(org, false)).every((entry) => entry.joinPlans.length === 0)).toBe(true);
    expect(planNorthOnly).not.toBe("");
  });
});

describe("drafts, publishing and versions", () => {
  const document = (headline: string) => readPageDocument({ tagline: headline, sections: [newSection("text", "text000001")] });

  it("shows visitors only the published document", async () => {
    await publishPage(org.id, document("live"), userId);
    await savePageDraft(org.id, document("draft"), userId);
    const stored = await loadStoredPage(org.id);
    expect(stored.published?.tagline).toBe("live");
    expect(stored.draft?.tagline).toBe("draft");
    expect(stored.draftSavedAt).not.toBeNull();
    const content = await loadPublicContent(org, null);
    expect(content.page?.tagline).toBe("live");
  });

  it("clears the draft on publish and keeps the newest versions", async () => {
    for (let index = 0; index < MAX_PAGE_VERSIONS + 3; index += 1) await publishPage(org.id, document(`v${index}`), userId, new Date(Date.now() + (index + 1) * 1000));
    expect((await loadStoredPage(org.id)).draft).toBeNull();
    const versions = await listPageVersions(org.id);
    expect(versions).toHaveLength(MAX_PAGE_VERSIONS);
    expect(versions[0]!.publishedByName).toBe("Editor");
  });

  it("restores a version into the draft without changing the live page", async () => {
    const versions = await listPageVersions(org.id);
    const oldest = versions[versions.length - 1]!;
    const restored = await restorePageVersion(org.id, oldest.id, userId);
    expect(restored?.document.tagline).toBe("v3");
    const stored = await loadStoredPage(org.id);
    expect(stored.draft?.tagline).toBe("v3");
    expect(stored.published?.tagline).toBe(`v${MAX_PAGE_VERSIONS + 2}`);
  });

  it("will not restore another organisation's version", async () => {
    const foreign = await prisma.organisationPageVersion.create({ data: { organisationId: otherOrgId, document: {}, publishedAt: new Date() } });
    expect(await restorePageVersion(org.id, foreign.id, userId)).toBeNull();
    expect(await loadPageVersion(org.id, foreign.id)).toBeNull();
  });

  it("previews a version without changing the draft", async () => {
    const before = await loadStoredPage(org.id);
    const [newest] = await listPageVersions(org.id);
    const document = await loadPageVersion(org.id, newest!.id);
    expect(document?.tagline).toBe(`v${MAX_PAGE_VERSIONS + 2}`);
    expect((await loadStoredPage(org.id)).draft?.tagline).toBe(before.draft?.tagline);
  });
});
