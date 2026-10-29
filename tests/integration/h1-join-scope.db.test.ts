import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ current: { id: "", email: "" } }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.current.id ? { user: identity.current } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { addStaff } from "../helpers/staff";
import { createMemberInvite, revokeMemberInvite, submitJoin } from "@/app/actions/join";
import { assignMemberRoles } from "@/app/actions/members";
import { commitMemberImport } from "@/app/actions/member-import";
import { loadJoinView } from "@/lib/views/app__o__orgSlug__join__planSlug__page";
import { loadOrgPlansView } from "@/lib/views/app__dashboard__orgSlug__plans__page";
import { loadPlanView } from "@/lib/views/app__dashboard__orgSlug__plans__planId__page";
import { loadOrgReportsTax } from "@/lib/views/app__dashboard__orgSlug__reports__tax__page";
import { loadOrgMembersDirectory } from "@/lib/views/app__dashboard__orgSlug__members__page";
import { loadMemberView } from "@/lib/views/app__dashboard__orgSlug__members__memberId__page";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const slug = `h1-scope-${suffix}`;
const people: Record<string, { id: string; email: string }> = {};
const units: Record<string, { id: string; path: string }> = {};
const roles: Record<string, string> = {};
const plans: Record<string, string> = {};
let orgId = "";

const signIn = (key: string) => {
  identity.current = people[key];
};
const params = { params: Promise.resolve({ orgSlug: slug }) };
const join = (planSlug: string, unitId: string, name: string) => submitJoin({ organisationSlug: slug, planSlug, consent: true, profile: { name, unitId } });
const memberOf = (key: string) => prisma.member.findFirstOrThrow({ where: { organisationId: orgId, email: people[key].email } });

async function unit(key: string, code: string, parent?: string) {
  const created = await prisma.orgUnit.create({ data: { organisationId: orgId, name: key, slug: key, code, level: parent ? 1 : 0, parentId: parent ? units[parent].id : null, path: "pending" } });
  const path = parent ? `${units[parent].path}/${created.id}` : created.id;
  await prisma.orgUnit.update({ where: { id: created.id }, data: { path } });
  units[key] = { id: created.id, path };
}

beforeAll(async () => {
  for (const key of ["owner", "area", "midlaj", "ajzal"]) {
    const user = await prisma.user.create({ data: { email: `${key}-${suffix}@example.test`, emailVerified: new Date(), name: key, mfaEnabledAt: new Date() } });
    people[key] = { id: user.id, email: user.email! };
  }
  const org = await prisma.organisation.create({ data: { name: "Kunj-Company", slug, status: "ACTIVE", unitLevels: ["Area", "Chapter"] } });
  orgId = org.id;
  await unit("north", "NTH");
  await unit("kollam", "KLM", "north");
  await unit("south", "STH");
  await unit("varkala", "VKL", "south");
  await addStaff(orgId, people.owner.id, "OWNER");
  await addStaff(orgId, people.area.id, "ADMIN", units.north.id);
  const northOnly = await prisma.membershipPlan.create({ data: { organisationId: orgId, name: "North only", slug: "north-only", joinMode: "OPEN", allUnits: false } });
  await prisma.planUnit.create({ data: { organisationId: orgId, planId: northOnly.id, unitId: units.north.id } });
  const open = await prisma.membershipPlan.create({ data: { organisationId: orgId, name: "Open", slug: "open", joinMode: "OPEN" } });
  plans.northOnly = northOnly.id;
  plans.open = open.id;
  for (const [key, unitId] of [["northLead", units.north.id], ["southLead", units.south.id], ["volunteer", null]] as const) {
    roles[key] = (await prisma.memberRole.create({ data: { organisationId: orgId, name: key, unitId } })).id;
  }
});

afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM "OutboxMessage" WHERE "payload"->>'organisationId' = ${orgId}`;
  await prisma.planUnit.deleteMany({ where: { organisationId: orgId } });
  await prisma.organisation.deleteMany({ where: { id: orgId } });
  await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: Object.values(people).map((p) => p.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(people).map((p) => p.id) } } });
  await prisma.$disconnect();
});

describe.sequential("joining a plan limited to an area", () => {
  it("offers the area's whole subtree, and locks a unit named by ?unit=CODE when it is offered", async () => {
    signIn("midlaj");
    const view = (unit?: string) => loadJoinView({ params: Promise.resolve({ orgSlug: slug, planSlug: "north-only" }), searchParams: Promise.resolve(unit === undefined ? {} : { unit }) });
    const plain = await view();
    expect(plain.units.map((u) => u.id).sort()).toEqual([units.north.id, units.kollam.id].sort());
    expect(plain.presetUnitId).toBeNull();
    expect(await view("klm")).toMatchObject({ presetUnitId: units.kollam.id, unitCode: "KLM" });
    expect(await view("VKL")).toMatchObject({ presetUnitId: null, unitCode: null });
    expect(await view("ZZZ")).toMatchObject({ presetUnitId: null, unitCode: null });
  });

  it("admits a member of a unit under the area and refuses one outside it", async () => {
    signIn("midlaj");
    expect(await join("north-only", units.kollam.id, "Midlaj C")).toMatchObject({ ok: true });
    signIn("ajzal");
    expect(await join("north-only", units.varkala.id, "Ajzal P")).toMatchObject({ ok: false, fieldErrors: { unitId: ["Not offered here"] } });
    expect(await join("open", units.varkala.id, "Ajzal P")).toMatchObject({ ok: true });
  });

  it("keeps an existing member's unit when they join another plan", async () => {
    signIn("midlaj");
    expect((await loadJoinView({ params: Promise.resolve({ orgSlug: slug, planSlug: "open" }), searchParams: Promise.resolve({ unit: "VKL" }) })).presetUnitId).toBe(units.kollam.id);
    expect(await join("open", units.varkala.id, "Midlaj C")).toMatchObject({ ok: true });
    expect((await memberOf("midlaj")).unitId).toBe(units.kollam.id);
  });

  it("finds a member record only by a verified email, and names their unit when the plan doesn't offer it", async () => {
    const view = (planSlug: string) => loadJoinView({ params: Promise.resolve({ orgSlug: slug, planSlug }), searchParams: Promise.resolve({}) });
    signIn("ajzal");
    await prisma.user.update({ where: { id: people.ajzal.id }, data: { emailVerified: null } });
    try {
      const unverified = await view("open");
      expect(unverified).toMatchObject({ standing: null, unitNotOffered: null });
      expect(unverified.presetUnitId).not.toBe(units.varkala.id);
    } finally {
      await prisma.user.update({ where: { id: people.ajzal.id }, data: { emailVerified: new Date() } });
    }
    const verified = await view("open");
    expect(verified.standing).not.toBeNull();
    expect(verified).toMatchObject({ presetUnitId: units.varkala.id, unitNotOffered: null });
    expect(await view("north-only")).toMatchObject({ presetUnitId: null, unitNotOffered: "varkala" });
    // A member keeps an archived unit: a plan open to every unit is still offered to them.
    await prisma.orgUnit.update({ where: { id: units.varkala.id }, data: { archivedAt: new Date() } });
    try {
      expect(await view("open")).toMatchObject({ unitNotOffered: null });
    } finally {
      await prisma.orgUnit.update({ where: { id: units.varkala.id }, data: { archivedAt: null } });
    }
  });
});

describe.sequential("member roles limited to a unit", () => {
  it("refuses a role whose unit's subtree doesn't hold the member", async () => {
    signIn("owner");
    const member = await memberOf("midlaj");
    expect(await assignMemberRoles({ organisationSlug: slug, memberId: member.id, roleIds: [roles.southLead] })).toMatchObject({ ok: false });
    expect(await assignMemberRoles({ organisationSlug: slug, memberId: member.id, roleIds: [roles.northLead, roles.volunteer] })).toMatchObject({ ok: true });
    expect(await prisma.memberRoleAssignment.count({ where: { memberId: member.id } })).toBe(2);
  });

  it("offers only the roles that can apply, on the member page and to a scoped viewer's directory", async () => {
    signIn("owner");
    const member = await memberOf("midlaj");
    const page = await loadMemberView({ params: Promise.resolve({ orgSlug: slug, memberId: member.id }) });
    expect(page.roles.map((r) => r.id).sort()).toEqual([roles.northLead, roles.volunteer].sort());
    expect((await loadOrgMembersDirectory({ ...params, searchParams: Promise.resolve({}) })).roles).toHaveLength(3);
    signIn("area");
    const scoped = await loadOrgMembersDirectory({ ...params, searchParams: Promise.resolve({}) });
    expect(scoped.roles.map((r) => r.id).sort()).toEqual([roles.northLead, roles.volunteer].sort());
  });
});

describe.sequential("scoped staff", () => {
  it("count only their own units' terms on the plans page", async () => {
    signIn("owner");
    expect((await loadOrgPlansView(params)).plans.find((p) => p.id === plans.open)).toMatchObject({ active: 2 });
    signIn("area");
    expect((await loadOrgPlansView(params)).plans.find((p) => p.id === plans.open)).toMatchObject({ active: 1 });
  });

  it("see only the invites that place people inside their units", async () => {
    signIn("owner");
    for (const unitId of [units.kollam.id, units.varkala.id, null]) expect(await createMemberInvite({ organisationSlug: slug, planId: plans.open, unitId, maxUses: 5 })).toMatchObject({ ok: true });
    const planParams = { params: Promise.resolve({ orgSlug: slug, planId: plans.open }) };
    expect((await loadPlanView(planParams)).invites).toHaveLength(3);
    signIn("area");
    expect((await loadPlanView(planParams)).invites.map((invite) => invite.unitId)).toEqual([units.kollam.id]);
  });

  it("revoke only the invites that place people inside their units", async () => {
    const revoke = async (unitId: string | null) => {
      const invite = await prisma.memberInvite.findFirstOrThrow({ where: { organisationId: orgId, planId: plans.open, unitId, revokedAt: null } });
      return revokeMemberInvite({ organisationSlug: slug, inviteId: invite.id });
    };
    signIn("area");
    for (const unitId of [units.varkala.id, null]) expect(await revoke(unitId)).toEqual({ ok: false, error: "Invite not found." });
    expect(await revoke(units.kollam.id)).toEqual({ ok: true });
    signIn("owner");
    for (const unitId of [units.varkala.id, null]) expect(await revoke(unitId)).toEqual({ ok: true });
    expect(await prisma.memberInvite.count({ where: { organisationId: orgId, revokedAt: null } })).toBe(0);
  });

  it("count only their own units' memberships on the plan page", async () => {
    const planParams = { params: Promise.resolve({ orgSlug: slug, planId: plans.open }) };
    signIn("owner");
    expect((await loadPlanView(planParams)).plan._count.terms).toBe(2);
    signIn("area");
    expect((await loadPlanView(planParams)).plan._count.terms).toBe(1);
  });

  it("never get the organisation-wide numbering checks", async () => {
    signIn("owner");
    expect((await loadOrgReportsTax({ ...params, searchParams: Promise.resolve({}) })).checks).toEqual([]);
    signIn("area");
    expect((await loadOrgReportsTax({ ...params, searchParams: Promise.resolve({}) })).checks).toBeNull();
  });
});

describe("importing", () => {
  it("matches the unit column by code, in any case", async () => {
    signIn("owner");
    const result = await commitMemberImport({ organisationSlug: slug, mapping: ["name", "email", "unit"], source: { kind: "csv", text: ["Name,Email,Chapter", `Anin Arafath,anin-import-${suffix}@example.test,vkl`].join("\n") } });
    expect(result).toMatchObject({ ok: true, data: { created: 1, skipped: [] } });
    expect((await prisma.member.findFirstOrThrow({ where: { organisationId: orgId, email: `anin-import-${suffix}@example.test` } })).unitId).toBe(units.varkala.id);
  });

  it("assigns a role limited to a unit only to rows inside that unit's subtree", async () => {
    signIn("owner");
    const email = (name: string) => `${name}-import-${suffix}@example.test`;
    const text = ["Name,Email,Chapter,Role", `Nihal K,${email("nihal")},KLM,southLead`, `Fathima R,${email("fathima")},KLM,northlead`].join("\n");
    const result = await commitMemberImport({ organisationSlug: slug, mapping: ["name", "email", "unit", "role"], source: { kind: "csv", text } });
    expect(result).toMatchObject({ ok: true, data: { created: 1, skipped: [{ row: 2, reason: "southLead isn't offered in this member's unit" }] } });
    expect(await prisma.member.count({ where: { organisationId: orgId, email: email("nihal") } })).toBe(0);
    const assigned = await prisma.memberRoleAssignment.findMany({ where: { organisationId: orgId, member: { email: email("fathima") } }, select: { roleId: true } });
    expect(assigned).toEqual([{ roleId: roles.northLead }]);
  });
});

describe.sequential("invites issued by staff limited to a unit", () => {
  it("never approve an existing member of another unit", async () => {
    const approval = await prisma.membershipPlan.create({ data: { organisationId: orgId, name: "By approval", slug: "by-approval", joinMode: "APPROVAL" } });
    signIn("area");
    const invite = await createMemberInvite({ organisationSlug: slug, planId: approval.id, unitId: units.kollam.id, maxUses: 5 });
    expect(invite).toMatchObject({ ok: true });
    const token = invite.ok ? invite.data!.token : "";
    // ajzal is a member in Varkala (South): their unit is kept, so a North invite can't stand in for approval.
    signIn("ajzal");
    expect(await submitJoin({ organisationSlug: slug, planSlug: "by-approval", inviteToken: token, consent: true, profile: { name: "Ajzal K" } })).toEqual({ ok: false, error: "This invite is for another unit. Ask the organisation for one that matches yours." });
    expect(await prisma.membershipTerm.count({ where: { planId: approval.id } })).toBe(0);
    expect((await prisma.memberInvite.findFirstOrThrow({ where: { token } })).uses).toBe(0);
  });
});
