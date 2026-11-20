import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ current: null as null | { id: string } }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.current ? { user: identity.current } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimitById: async () => true, getRedisClient: () => null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { openTerm, upsertMember } from "@/lib/membership/service";
import { limitsKey, memberWhere, teamScope } from "@/lib/membership/scope";
import { getMembership } from "@/lib/permissions";
import { recordPayment } from "@/app/actions/payments";
import { authorizeCardAccess } from "@/lib/cards/access";
import { loadHomeAnalytics } from "@/lib/reports/homeData";
import { loadOrgOverviewView } from "@/lib/views/app__dashboard__orgSlug__page";
import { loadOrgMembersDirectory } from "@/lib/views/app__dashboard__orgSlug__members__page";
import { loadMemberView } from "@/lib/views/app__dashboard__orgSlug__members__memberId__page";
import { loadPaymentsDirectory } from "@/lib/views/app__dashboard__orgSlug__payments__page";
import { loadOrgReportsUnits } from "@/lib/views/app__dashboard__orgSlug__reports__units__page";
import { loadVerifyView } from "@/lib/views/app__verify__token__page";
import { GET as exportMembers } from "@/app/api/exports/members/[orgSlug]/route";
import { createOrgGrouping } from "@/app/actions/groupings";
import { setGroupingForMembers, setMemberGroupings } from "@/app/actions/member-groupings";
import { addStaff } from "../helpers/staff";
import { removePaymentsOrg } from "./payments-helpers";

// Staff limited by a grouping value see and act only on members holding it (or a value under it), everywhere,
// exactly as if everyone else did not exist; with a unit limit too, both must hold.
const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const users: Record<string, string> = {};
const people: Record<string, { id: string; name: string; cardId: string; token: string; paymentId: string }> = {};
const value: Record<string, { id: string; groupingId: string; path: string }> = {};
let org: { id: string; slug: string; timezone: string; financialYearStartMonth: number };
let unit: { id: string };

const as = (key: string) => { identity.current = { id: users[key]! }; };
const orgParams = () => Promise.resolve({ orgSlug: org.slug });
const person = (key: string) => people[key]!;

async function makeValue(key: string, groupingId: string, label: string, parent?: string) {
  const created = await prisma.orgGroupingValue.create({ data: { organisationId: org.id, groupingId, parentId: parent ? value[parent]!.id : null, label, code: label.toUpperCase(), level: parent ? 1 : 0, path: "pending" } });
  const path = parent ? `${value[parent]!.path}/${created.id}` : created.id;
  await prisma.orgGroupingValue.update({ where: { id: created.id }, data: { path } });
  value[key] = { id: created.id, groupingId, path };
}

const limitTo = (userId: string, key: string) => prisma.teamMemberScope.create({ data: { organisationId: org.id, teamMemberId: staffIds[userId]!, groupingId: value[key]!.groupingId, valueId: value[key]!.id } });
const staffIds: Record<string, string> = {};

async function staff(key: string, role: "OWNER" | "ADMIN", unitId: string | null = null) {
  users[key] = (await prisma.user.create({ data: { email: `${key.toLowerCase()}-${suffix}@example.test`, name: key, emailVerified: new Date(), mfaEnabledAt: new Date() } })).id;
  staffIds[users[key]!] = (await addStaff(org.id, users[key]!, role, unitId)).id;
}

beforeAll(async () => {
  const created = await prisma.organisation.create({ data: { name: "Grouping Matrix", slug: `grouping-matrix-${suffix}`, status: "ACTIVE", unitLevels: ["Area"] } });
  org = { id: created.id, slug: created.slug, timezone: created.timezone, financialYearStartMonth: created.financialYearStartMonth };
  const north = await prisma.orgUnit.create({ data: { organisationId: org.id, name: "North", slug: `north-${suffix}`, code: "NORTH", level: 0, path: "pending" } });
  await prisma.orgUnit.update({ where: { id: north.id }, data: { path: north.id } });
  unit = north;
  const profession = await prisma.orgGrouping.create({ data: { organisationId: org.id, key: "profession", name: "Profession" } });
  const region = await prisma.orgGrouping.create({ data: { organisationId: org.id, key: "region", name: "Region", kind: "tree" } });
  await makeValue("doctors", profession.id, "Doctors");
  await makeValue("engineers", profession.id, "Engineers");
  await makeValue("india", region.id, "India");
  await makeValue("kerala", region.id, "Kerala", "india");
  await staff("owner", "OWNER");
  await staff("doctorLead", "ADMIN");
  await staff("indiaLead", "ADMIN");
  await staff("northDoctor", "ADMIN", north.id);
  await limitTo(users.doctorLead!, "doctors");
  await limitTo(users.indiaLead!, "india");
  await limitTo(users.northDoctor!, "doctors");
  const plan = async (name: string, priceNewMinor: number) => prisma.membershipPlan.create({ data: { organisationId: org.id, name, slug: `${name.toLowerCase()}-${suffix}`, currency: "INR", priceNewMinor, joinMode: "OPEN" } });
  const [free, paid] = [await plan("Free", 0), await plan("Paid", 50_000)];
  as("owner");
  // dina: Doctors in Kerala and in North; eli: Engineers in India (not Kerala); nox: nothing.
  for (const [key, professionKey, regionKey, unitId] of [["dina", "doctors", "kerala", north.id], ["eli", "engineers", "india", null], ["nox", null, null, null]] as const) {
    const name = `${key[0]!.toUpperCase()}${key.slice(1)} Grouped ${suffix}`;
    const member = await prisma.$transaction((tx) => upsertMember(tx, org.id, { email: `${key}-${suffix}@example.test`, name, source: "MANUAL", unitId: unitId ?? undefined }));
    for (const held of [professionKey, regionKey]) if (held) await prisma.memberGroupingValue.create({ data: { organisationId: org.id, memberId: member.id, groupingId: value[held]!.groupingId, valueId: value[held]!.id } });
    await prisma.$transaction((tx) => openTerm(tx, { org, plan: free, memberId: member.id, byManager: true, actorUserId: users.owner! }));
    const paidTerm = await prisma.$transaction((tx) => openTerm(tx, { org, plan: paid, memberId: member.id, byManager: true, actorUserId: users.owner! }));
    const payment = await recordPayment({ organisationSlug: org.slug, termId: paidTerm.id, method: "cash" });
    if (!payment.ok) throw new Error(payment.error);
    const card = await prisma.memberCard.findFirstOrThrow({ where: { organisationId: org.id, memberId: member.id, planId: free.id } });
    people[key] = { id: member.id, name, cardId: card.id, token: card.verifyToken, paymentId: payment.data!.paymentId };
  }
});

afterAll(async () => {
  await prisma.orgUnit.updateMany({ where: { organisationId: org.id }, data: { parentId: null } });
  await removePaymentsOrg(org.id, Object.values(users));
  await prisma.$disconnect();
});

describe.sequential("a Doctors-limited manager sees Doctors only", () => {
  it("lists, counts and opens only members holding the value", async () => {
    as("doctorLead");
    const directory = await loadOrgMembersDirectory({ params: orgParams(), searchParams: Promise.resolve({}) });
    expect(directory.rows.map((row) => row.id)).toEqual([person("dina").id]);
    expect(directory.counts.all).toBe(1);
    expect(directory.groupings.find((grouping) => grouping.limited)?.values.map((entry) => entry.label)).toEqual(["Doctors"]);
    // Filters can only narrow what is already in reach, never widen it.
    for (const search of [{ q: "Eli Grouped" }, { gv: value.engineers!.id }]) {
      expect((await loadOrgMembersDirectory({ params: orgParams(), searchParams: Promise.resolve(search) })).rows).toEqual([]);
    }
    expect((await loadMemberView({ params: Promise.resolve({ orgSlug: org.slug, memberId: person("dina").id }) })).member.id).toBe(person("dina").id);
    await expect(loadMemberView({ params: Promise.resolve({ orgSlug: org.slug, memberId: person("eli").id }) })).rejects.toThrow();
    await expect(loadMemberView({ params: Promise.resolve({ orgSlug: org.slug, memberId: person("nox").id }) })).rejects.toThrow();
  });

  it("counts, lists and charts only their members, keyed apart from organisation-wide staff", async () => {
    as("doctorLead");
    expect((await loadOrgOverviewView({ params: orgParams() })).members).toMatchObject({ active: 1, payment: 0 });
    const membership = (await getMembership(users.doctorLead!, org.id))!;
    const clock = { id: org.id, timezone: org.timezone, financialYearStartMonth: org.financialYearStartMonth, currency: "INR" };
    const limited = await loadHomeAnalytics(clock, membership, new Date());
    const everyone = await loadHomeAnalytics(clock, (await getMembership(users.owner!, org.id))!, new Date());
    expect(limited?.scoped).toBe(true);
    expect(everyone?.scoped).toBe(false);
    expect(limited?.membership).not.toEqual(everyone?.membership);
    expect(limitsKey((await teamScope(org.id, membership)).limits)).not.toBe(limitsKey([]));
    const payments = await loadPaymentsDirectory({ params: orgParams(), searchParams: Promise.resolve({}) });
    expect(payments.payments.map((row) => row.id)).toEqual([person("dina").paymentId]);
    const units = await loadOrgReportsUnits({ params: orgParams(), searchParams: Promise.resolve({}) });
    expect(units.byGrouping.rows.find((row) => row.label === "Doctors")?.members).toBe(1);
    expect(units.byGrouping.rows.find((row) => row.label === "Engineers")?.members).toBe(0);
    expect(units.byGrouping.unassigned).toBe(0);
  });

  it("opens, scans and exports only their members' cards and rows", async () => {
    as("doctorLead");
    expect(await authorizeCardAccess(person("dina").cardId)).toMatchObject({ as: "team" });
    expect(await authorizeCardAccess(person("eli").cardId)).toBeNull();
    expect((await loadVerifyView({ params: Promise.resolve({ token: person("dina").token }) })).staff).toMatchObject({ state: "panel" });
    expect((await loadVerifyView({ params: Promise.resolve({ token: person("eli").token }) })).staff).toBeNull();
    const text = await (await exportMembers(new Request(`http://localhost/api/exports/members/${org.slug}`), { params: orgParams() })).text();
    expect(text).toContain(person("dina").name);
    expect(text).not.toContain(person("eli").name);
    expect(text).toContain("Profession");
  });

  it("covers a tree value's subtree and combines with a unit limit as an AND", async () => {
    as("indiaLead");
    expect((await loadOrgMembersDirectory({ params: orgParams(), searchParams: Promise.resolve({}) })).rows.map((row) => row.id).sort()).toEqual([person("dina").id, person("eli").id].sort());
    as("northDoctor");
    expect((await loadOrgMembersDirectory({ params: orgParams(), searchParams: Promise.resolve({}) })).rows.map((row) => row.id)).toEqual([person("dina").id]);
    // Remove dina's unit: Doctors alone no longer reaches her through the unit limit.
    await prisma.member.update({ where: { id: person("dina").id }, data: { unitId: null } });
    expect((await loadOrgMembersDirectory({ params: orgParams(), searchParams: Promise.resolve({}) })).rows).toEqual([]);
    await prisma.member.update({ where: { id: person("dina").id }, data: { unitId: unit.id } });
    const where = memberWhere(await teamScope(org.id, (await getMembership(users.northDoctor!, org.id))!));
    expect(await prisma.member.count({ where })).toBe(1);
  });

  it("refuses to give a value outside their reach, to touch members outside it, or to manage groupings", async () => {
    as("doctorLead");
    const swap = await setMemberGroupings({ organisationSlug: org.slug, memberId: person("dina").id, groupings: [{ groupingId: value.doctors!.groupingId, valueIds: [value.engineers!.id] }] });
    expect(swap.ok).toBe(false);
    expect((await setMemberGroupings({ organisationSlug: org.slug, memberId: person("eli").id, groupings: [{ groupingId: value.doctors!.groupingId, valueIds: [value.doctors!.id] }] })).ok).toBe(false);
    const bulk = await setGroupingForMembers({ organisationSlug: org.slug, memberIds: [person("dina").id, person("eli").id], groupingId: value.doctors!.groupingId, valueId: null });
    expect(bulk.ok).toBe(false);
    const ok = await setGroupingForMembers({ organisationSlug: org.slug, memberIds: [person("dina").id, person("eli").id], groupingId: value.india!.groupingId, valueId: value.india!.id });
    expect(ok).toMatchObject({ ok: true, data: { done: 1, skipped: 1 } });
    expect((await createOrgGrouping({ organisationSlug: org.slug, name: "Interest", kind: "list" })).ok).toBe(false);
    const held = await prisma.memberGroupingValue.findMany({ where: { memberId: person("eli").id, groupingId: value.doctors!.groupingId } });
    expect(held.map((row) => row.valueId)).toEqual([value.engineers!.id]);
  });
});
