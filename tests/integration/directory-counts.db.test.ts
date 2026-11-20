import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { memberFilterWhere } from "@/lib/cards/exportFilter";
import { countDirectoryFilters } from "@/lib/membership/directoryCounts";
import { MEMBER_FILTERS } from "@/lib/membership/describe";
import { memberWhere } from "@/lib/membership/scope";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const DAY = 86_400_000;
const now = new Date();
let numbered = 0;
let orgId = "";
let planId = "";
let roleId = "";
let grouping = { id: "", path: "" };
let north = { id: "", path: "" };
let south = { id: "", path: "" };

async function unit(name: string, code: string) {
  const created = await prisma.orgUnit.create({ data: { organisationId: orgId, name, slug: name, code, level: 0, path: "pending" } });
  await prisma.orgUnit.update({ where: { id: created.id }, data: { path: created.id } });
  return { id: created.id, path: created.id };
}

async function member(name: string, email: string, unitId: string | null, terms: Array<Partial<Prisma.MembershipTermUncheckedCreateInput> & { status: "ACTIVE" | "LAPSED" | "GRACE" | "PENDING_APPROVAL" | "PENDING_PAYMENT" | "UPCOMING" }>, extra: Partial<Prisma.MemberUncheckedCreateInput> = {}) {
  const created = await prisma.member.create({ data: { organisationId: orgId, memberNumber: ++numbered, name, email, unitId, ...extra } });
  for (const term of terms) {
    await prisma.membershipTerm.create({ data: { organisationId: orgId, memberId: created.id, planId, currency: "INR", priceMinor: 0, startsAt: new Date(now.getTime() - 100 * DAY), ...term } });
  }
  return created;
}

beforeAll(async () => {
  const org = await prisma.organisation.create({ data: { name: "Counts", slug: `counts-${suffix}`, status: "ACTIVE" } });
  orgId = org.id;
  north = await unit("north", "NTH");
  south = await unit("south", "STH");
  planId = (await prisma.membershipPlan.create({ data: { organisationId: orgId, name: "Open", slug: "open", joinMode: "OPEN" } })).id;
  roleId = (await prisma.memberRole.create({ data: { organisationId: orgId, name: "Volunteer" } })).id;
  const soon = new Date(now.getTime() + 10 * DAY);
  const far = new Date(now.getTime() + 200 * DAY);
  const group = await prisma.orgGrouping.create({ data: { organisationId: orgId, key: "team", name: "Team" } });
  const value = await prisma.orgGroupingValue.create({ data: { organisationId: orgId, groupingId: group.id, label: "Red", code: "RED", path: "pending" } });
  await prisma.orgGroupingValue.update({ where: { id: value.id }, data: { path: value.id } });
  grouping = { id: group.id, path: value.id };
  const asha = await member("Asha 100% Rao", "asha@example.test", north.id, [{ status: "ACTIVE", endsAt: soon }]);
  await prisma.memberGroupingValue.create({ data: { organisationId: orgId, memberId: asha.id, groupingId: group.id, valueId: value.id } });
  const renewed = await member("Bala Iyer", "bala@example.test", north.id, [{ status: "ACTIVE", endsAt: soon }]);
  const old = await prisma.membershipTerm.findFirstOrThrow({ where: { memberId: renewed.id } });
  await prisma.membershipTerm.create({ data: { organisationId: orgId, memberId: renewed.id, planId, currency: "INR", priceMinor: 0, status: "UPCOMING", startsAt: new Date(now.getTime() + 11 * DAY), renewedFromId: old.id } });
  await member("Chitra", "chitra@example.test", south.id, [{ status: "ACTIVE", endsAt: far }]);
  await member("Dev", "dev@example.test", south.id, [{ status: "LAPSED" }]);
  await member("Esha", "esha@example.test", null, [{ status: "LAPSED" }, { status: "GRACE" }]);
  await member("Farid", "farid@example.test", north.id, [{ status: "PENDING_APPROVAL" }]);
  await member("Gita", "gita@example.test", north.id, [{ status: "PENDING_PAYMENT" }]);
  const roled = await member("Hari 7", "hari@example.test", north.id, []);
  await prisma.memberRoleAssignment.create({ data: { organisationId: orgId, memberId: roled.id, roleId, isPrimary: true } });
  await member("Gone", "gone@example.test", north.id, [{ status: "ACTIVE", endsAt: soon }], { anonymisedAt: new Date() });
});

afterAll(async () => {
  await prisma.organisation.delete({ where: { id: orgId } }).catch(() => undefined);
});

type Case = { name: string; input: () => Partial<Parameters<typeof countDirectoryFilters>[0]>; base: () => Prisma.MemberWhereInput };

const cases: Case[] = [
  { name: "the whole organisation", input: () => ({}), base: () => ({ ...memberWhere({ organisationId: orgId, unitId: null, unitPath: null, limits: [] }), anonymisedAt: null }) },
  { name: "a unit scope", input: () => ({ scopePath: north.path }), base: () => ({ ...memberWhere({ organisationId: orgId, unitId: north.id, unitPath: north.path, limits: [] }), anonymisedAt: null }) },
  { name: "a name search with LIKE characters", input: () => ({ q: "100%", matchEmail: false }), base: () => ({ organisationId: orgId, anonymisedAt: null, OR: [{ name: { contains: "100%", mode: "insensitive" } }] }) },
  { name: "a search that may match email", input: () => ({ q: "DEV@", matchEmail: true }), base: () => ({ organisationId: orgId, anonymisedAt: null, OR: [{ name: { contains: "DEV@", mode: "insensitive" } }, { email: { contains: "DEV@", mode: "insensitive" } }] }) },
  { name: "a member number", input: () => ({ q: "1", matchEmail: false }), base: () => ({ organisationId: orgId, anonymisedAt: null, OR: [{ name: { contains: "1", mode: "insensitive" } }, { memberNumber: 1 }] }) },
  { name: "a plan, unit and role", input: () => ({ planId, unitId: north.id, roleId }), base: () => ({ organisationId: orgId, anonymisedAt: null, terms: { some: { planId } }, unitId: north.id, roles: { some: { roleId } } }) },
  { name: "a grouping limit", input: () => ({ limits: [{ groupingId: grouping.id, paths: [grouping.path] }] }), base: () => ({ ...memberWhere({ organisationId: orgId, unitId: null, unitPath: null, limits: [{ groupingId: grouping.id, valueIds: [], paths: [grouping.path] }] }), anonymisedAt: null }) },
  { name: "a subtree drill-down", input: () => ({ subtreePath: south.path }), base: () => ({ organisationId: orgId, anonymisedAt: null, AND: [memberWhere({ organisationId: orgId, unitId: south.id, unitPath: south.path, limits: [] })] }) },
];

describe("countDirectoryFilters", () => {
  for (const { name, input, base } of cases) {
    it(`matches the Prisma filters for ${name}`, async () => {
      const counts = await countDirectoryFilters({ organisationId: orgId, scopePath: null, limits: [], subtreePath: null, q: "", matchEmail: false, drillMemberIds: null, now, ...input() });
      for (const filter of MEMBER_FILTERS) {
        const expected = await prisma.member.count({ where: { AND: [base(), memberFilterWhere(filter, now)] } });
        expect({ filter, count: counts[filter] }).toEqual({ filter, count: expected });
      }
    });
  }

  it("counts the members behind a drill-down", async () => {
    const ids = (await prisma.member.findMany({ where: { organisationId: orgId, unitId: south.id }, select: { id: true } })).map((row) => row.id);
    const counts = await countDirectoryFilters({ organisationId: orgId, scopePath: null, limits: [], subtreePath: null, q: "", matchEmail: false, drillMemberIds: ids, now });
    expect(counts.all).toBe(ids.length);
    expect(counts.lapsed).toBe(1);
  });
});
