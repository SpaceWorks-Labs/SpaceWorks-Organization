import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ current: null as null | { id: string } }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.current ? { user: identity.current } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimitById: async () => true, getRedisClient: () => null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { openTerm, upsertMember } from "@/lib/membership/service";
import { teamScope } from "@/lib/membership/scope";
import { getMembership } from "@/lib/permissions";
import { recordPayment } from "@/app/actions/payments";
import { authorizeCardAccess } from "@/lib/cards/access";
import { exportCardsWhere, parseExportFilter } from "@/lib/cards/exportFilter";
import { queueVerificationAlerts } from "@/lib/membership/importAlerts";
import { loadHomeAnalytics } from "@/lib/reports/homeData";
import { loadOrgOverviewView } from "@/lib/views/app__dashboard__orgSlug__page";
import { loadOrgMembersDirectory } from "@/lib/views/app__dashboard__orgSlug__members__page";
import { loadMemberView } from "@/lib/views/app__dashboard__orgSlug__members__memberId__page";
import { loadPaymentsDirectory } from "@/lib/views/app__dashboard__orgSlug__payments__page";
import { loadCollectionSheet } from "@/lib/views/app__dashboard__orgSlug__payments__collect__page";
import { loadOrgReportsCash } from "@/lib/views/app__dashboard__orgSlug__reports__cash__page";
import { loadOrgReportsUnits } from "@/lib/views/app__dashboard__orgSlug__reports__units__page";
import { loadVerifyView } from "@/lib/views/app__verify__token__page";
import { GET as exportMembers } from "@/app/api/exports/members/[orgSlug]/route";
import { addStaff } from "../helpers/staff";
import { removePaymentsOrg } from "./payments-helpers";

// Owner requirement: staff limited to a unit see and act only on the people in that unit's subtree, everywhere,
// exactly as if everyone else did not exist. North (with North 1 below it) and South are siblings.
const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const users: Record<string, string> = {};
const units: Record<string, { id: string; path: string }> = {};
const people: Record<string, { id: string; name: string; cardId: string; token: string; paymentId: string; fundTermId: string }> = {};
let org: { id: string; slug: string; timezone: string; financialYearStartMonth: number };

const as = (key: string) => {
  identity.current = { id: users[key]! };
};
const orgParams = () => Promise.resolve({ orgSlug: org.slug });
const names = (text: string) => ({ north: text.includes(people.nina!.name), south: text.includes(people.sam!.name) });

async function unit(key: string, name: string, code: string, parent?: string) {
  const created = await prisma.orgUnit.create({ data: { organisationId: org.id, name, slug: `${key}-${suffix}`, code, level: parent ? 1 : 0, parentId: parent ? units[parent]!.id : null, path: "pending" } });
  const path = parent ? `${units[parent]!.path}/${created.id}` : created.id;
  await prisma.orgUnit.update({ where: { id: created.id }, data: { path } });
  units[key] = { id: created.id, path };
}

beforeAll(async () => {
  const created = await prisma.organisation.create({ data: { name: "Scope Matrix", slug: `scope-matrix-${suffix}`, status: "ACTIVE", unitLevels: ["Area", "Unit"] } });
  org = { id: created.id, slug: created.slug, timezone: created.timezone, financialYearStartMonth: created.financialYearStartMonth };
  await unit("north", "North", "NORTH");
  await unit("north1", "North 1", "NORTH1", "north");
  await unit("south", "South", "SOUTH");
  for (const key of ["owner", "northLead"]) {
    users[key] = (await prisma.user.create({ data: { email: `${key.toLowerCase()}-${suffix}@example.test`, name: key, emailVerified: new Date(), mfaEnabledAt: new Date() } })).id;
  }
  await addStaff(org.id, users.owner!, "OWNER");
  await addStaff(org.id, users.northLead!, "ADMIN", units.north!.id);
  const plan = (name: string, priceNewMinor: number) => prisma.membershipPlan.create({ data: { organisationId: org.id, name, slug: `${name.toLowerCase()}-${suffix}`, currency: "INR", priceNewMinor, joinMode: "OPEN", durationType: "ORG_YEAR" } });
  const [free, paid, fund] = [await plan("Free", 0), await plan("Paid", 50_000), await plan("Fund", 30_000)];
  as("owner");
  for (const [key, unitKey] of [["nina", "north1"], ["sam", "south"]] as const) {
    const name = `${key[0]!.toUpperCase()}${key.slice(1)} Matrix ${suffix}`;
    const member = await prisma.$transaction((tx) => upsertMember(tx, org.id, { email: `${key}-${suffix}@example.test`, name, source: "MANUAL", unitId: units[unitKey]!.id }));
    await prisma.$transaction((tx) => openTerm(tx, { org, plan: free, memberId: member.id, byManager: true, actorUserId: users.owner! }));
    const paidTerm = await prisma.$transaction((tx) => openTerm(tx, { org, plan: paid, memberId: member.id, byManager: true, actorUserId: users.owner! }));
    const fundTerm = await prisma.$transaction((tx) => openTerm(tx, { org, plan: fund, memberId: member.id, byManager: true, actorUserId: users.owner! }));
    const payment = await recordPayment({ organisationSlug: org.slug, termId: paidTerm.id, method: "cash" });
    if (!payment.ok) throw new Error(payment.error);
    const card = await prisma.memberCard.findFirstOrThrow({ where: { organisationId: org.id, memberId: member.id, planId: free.id } });
    people[key] = { id: member.id, name, cardId: card.id, token: card.verifyToken, paymentId: payment.data!.paymentId, fundTermId: fundTerm.id };
  }
});

afterAll(async () => {
  await prisma.orgUnit.updateMany({ where: { organisationId: org.id }, data: { parentId: null } });
  await removePaymentsOrg(org.id, Object.values(users));
  await prisma.$disconnect();
});

describe.sequential("a North-limited manager sees North's people only", () => {
  it("lists, counts and searches members in North's subtree only, and 404s South's page", async () => {
    as("northLead");
    const directory = await loadOrgMembersDirectory({ params: orgParams(), searchParams: Promise.resolve({}) });
    expect(directory.rows.map((row) => row.id)).toEqual([people.nina!.id]);
    expect(directory.total).toBe(1);
    expect(directory.counts.all).toBe(1);
    expect(directory.units.map((entry) => entry.id).sort()).toEqual([units.north!.id, units.north1!.id].sort());
    for (const search of [{ q: "Sam Matrix" }, { unit: units.south!.id }]) {
      expect((await loadOrgMembersDirectory({ params: orgParams(), searchParams: Promise.resolve(search) })).rows).toEqual([]);
    }
    expect((await loadMemberView({ params: Promise.resolve({ orgSlug: org.slug, memberId: people.nina!.id }) })).member.id).toBe(people.nina!.id);
    await expect(loadMemberView({ params: Promise.resolve({ orgSlug: org.slug, memberId: people.sam!.id }) })).rejects.toThrow();
  });

  it("counts only North's people on the home page and in its charts", async () => {
    as("northLead");
    const home = await loadOrgOverviewView({ params: orgParams() });
    expect(home.members).toMatchObject({ active: 1, payment: 1 });
    const membership = (await getMembership(users.northLead!, org.id))!;
    const charts = await loadHomeAnalytics({ id: org.id, timezone: org.timezone, financialYearStartMonth: org.financialYearStartMonth, currency: "INR" }, membership, new Date());
    expect(charts?.money).toMatchObject({ outstanding: [{ currency: "INR", minor: 30_000 }], outstandingCount: 1 });
    as("owner");
    const all = await loadOrgOverviewView({ params: orgParams() });
    expect(all.members).toMatchObject({ active: 2, payment: 2 });
  });

  it("lists North's payments, collection rows and cash in hand only", async () => {
    as("northLead");
    const payments = await loadPaymentsDirectory({ params: orgParams(), searchParams: Promise.resolve({}) });
    expect(payments.payments.map((row) => row.id)).toEqual([people.nina!.paymentId]);
    expect((await loadPaymentsDirectory({ params: orgParams(), searchParams: Promise.resolve({ q: "Sam Matrix" }) })).payments).toEqual([]);
    for (const unitId of [undefined, units.south!.id]) {
      const sheet = await loadCollectionSheet({ params: orgParams(), searchParams: Promise.resolve(unitId ? { unit: unitId } : {}) });
      expect(sheet.rows.map((row) => row.termId)).toEqual([people.nina!.fundTermId]);
      expect(sheet.allowWholeOrganisation).toBe(false);
    }
    const cash = await loadOrgReportsCash({ params: orgParams(), searchParams: Promise.resolve({}) });
    expect(cash).toMatchObject({ payments: 1, held: [{ currency: "INR", minor: 50_000 }] });
    expect(cash.byUnit.map((row) => row.label)).toEqual(["North 1"]);
    as("owner");
    expect((await loadOrgReportsCash({ params: orgParams(), searchParams: Promise.resolve({}) })).payments).toBe(2);
  });

  it("downloads, opens and scans North's cards only", async () => {
    as("northLead");
    const where = exportCardsWhere(await teamScope(org.id, units.north!.id), parseExportFilter({}), { contact: true });
    expect((await prisma.memberCard.findMany({ where, select: { memberId: true } })).map((card) => card.memberId)).toEqual(expect.arrayContaining([people.nina!.id]));
    expect(await prisma.memberCard.count({ where: { AND: [where, { memberId: people.sam!.id }] } })).toBe(0);
    expect(await authorizeCardAccess(people.nina!.cardId)).toMatchObject({ as: "team" });
    expect(await authorizeCardAccess(people.sam!.cardId)).toBeNull();
    expect((await loadVerifyView({ params: Promise.resolve({ token: people.nina!.token }) })).staff).toMatchObject({ state: "panel" });
    // South's card shows the North lead exactly the public check anyone gets.
    const publicPart = ({ view, images, staff }: Awaited<ReturnType<typeof loadVerifyView>>) => ({ view, images, staff });
    const scanned = publicPart(await loadVerifyView({ params: Promise.resolve({ token: people.sam!.token }) }));
    identity.current = null;
    expect(scanned).toEqual(publicPart(await loadVerifyView({ params: Promise.resolve({ token: people.sam!.token }) })));
    expect(scanned.staff).toBeNull();
  });

  it("ranks North's units only in the league, whatever unit is asked for", async () => {
    as("northLead");
    for (const unitId of [undefined, units.south!.id]) {
      const league = await loadOrgReportsUnits({ params: orgParams(), searchParams: Promise.resolve(unitId ? { unit: unitId } : {}) });
      expect(league.rows.map((row) => row.name)).toEqual(["North 1"]);
      expect(league.rows[0]).toMatchObject({ active: 1, outstanding: [{ currency: "INR", minor: 30_000 }] });
    }
  });

  it("exports North's members only", async () => {
    as("northLead");
    const response = await exportMembers(new Request(`http://localhost/api/exports/members/${org.slug}`), { params: orgParams() });
    expect(response.status).toBe(200);
    expect(names(await response.text())).toEqual({ north: true, south: false });
  });

  it("alerts the North lead about members waiting in North's subtree only", async () => {
    const alerted = async (paths: string[]) => {
      await prisma.$executeRaw`DELETE FROM "OutboxMessage" WHERE "kind" = 'verification-alert' AND "payload"->>'organisationId' = ${org.id}`;
      await prisma.$transaction((tx) => queueVerificationAlerts(tx, org.id, "someone-else", paths));
      const rows = await prisma.outboxMessage.findMany({ where: { kind: "verification-alert", payload: { path: ["organisationId"], equals: org.id } }, select: { payload: true } });
      return rows.map((row) => row.payload as { userId: string; count: number }).sort((a, b) => a.userId.localeCompare(b.userId));
    };
    expect((await alerted([units.south!.path])).map((row) => row.userId)).toEqual([users.owner]);
    expect(await alerted([units.north1!.path, units.south!.path])).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: users.northLead, count: 1 }),
      expect.objectContaining({ userId: users.owner, count: 2 }),
    ]));
  });
});
