import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (mocks.userId ? { user: { id: mocks.userId } } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("@/lib/reauth", () => ({ hasRecentAuthentication: async () => true }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { removeTeamMember, setTeamMemberUnit, updateTeamRole } from "@/app/actions/team";
import { createOrgInvite } from "@/app/actions/org-invites";
import { acceptOrganisationInviteToken } from "@/lib/inviteAcceptance";
import { addStaff, starterRole } from "@/tests/helpers/staff";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const orgIds: string[] = [];
const userIds: string[] = [];
let org: { id: string; slug: string };
const u: Record<string, string> = {};
const units: Record<string, { id: string; path: string }> = {};

async function person(name: string, extra: { isSuperAdmin?: boolean } = {}) {
  const user = await prisma.user.create({ data: { email: `${name}-${suffix}@example.test`, name, emailVerified: new Date(), mfaEnabledAt: new Date(), ...extra } });
  userIds.push(user.id);
  return user;
}

async function unit(key: string, code: string, parent?: string) {
  const created = await prisma.orgUnit.create({ data: { organisationId: org.id, name: key, slug: `${key}-${suffix}`, code, level: parent ? 1 : 0, parentId: parent ? units[parent].id : null, path: "pending" } });
  const path = parent ? `${units[parent].path}/${created.id}` : created.id;
  await prisma.orgUnit.update({ where: { id: created.id }, data: { path } });
  units[key] = { id: created.id, path };
}

const role = async (key: "OWNER" | "ADMIN" | "TREASURER" | "VIEWER") => (await starterRole(org.id, key)).id;
const member = (userId: string, organisationId = org.id) => prisma.teamMember.findUniqueOrThrow({ where: { userId_organisationId: { userId, organisationId } } });
const as = (userId: string) => { mocks.userId = userId; };
async function invite(input: { roleId: string; unitId?: string | null }) {
  const result = await createOrgInvite({ organisationSlug: org.slug, ...input });
  if (!result.ok) throw new Error(result.error);
  return result.data!.token;
}
const accept = (token: string, user: { id: string; email: string | null }) => acceptOrganisationInviteToken(token, { id: user.id, email: user.email, emailVerified: true });

beforeAll(async () => {
  const created = await prisma.organisation.create({ data: { name: "Granting Network", slug: `granting-${suffix}`, status: "ACTIVE", unitLevels: ["Area", "Ward"] } });
  org = { id: created.id, slug: created.slug };
  orgIds.push(org.id);
  await unit("north", `N${suffix.slice(0, 4)}`.toUpperCase());
  await unit("ward", `W${suffix.slice(0, 4)}`.toUpperCase(), "north");
  await unit("south", `S${suffix.slice(0, 4)}`.toUpperCase());
  for (const name of ["owner", "manager", "scoped", "treasurer", "t1", "t2", "t3", "t4"]) u[name] = (await person(name)).id;
  await addStaff(org.id, u.owner, "OWNER");
  await addStaff(org.id, u.manager, "ADMIN");
  await addStaff(org.id, u.scoped, "ADMIN", units.north.id);
  await addStaff(org.id, u.treasurer, "TREASURER");
  await addStaff(org.id, u.t1, "VIEWER");
  await addStaff(org.id, u.t2, "VIEWER");
  await addStaff(org.id, u.t3, "VIEWER", units.ward.id);
  await addStaff(org.id, u.t4, "VIEWER", units.south.id);
});

afterAll(async () => {
  for (const id of orgIds) {
    await prisma.teamInvite.deleteMany({ where: { organisationId: id } });
    await prisma.teamMember.deleteMany({ where: { organisationId: id } });
    await prisma.orgUnit.updateMany({ where: { organisationId: id }, data: { parentId: null } });
    await prisma.organisation.delete({ where: { id } }).catch(() => undefined);
  }
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe.sequential("team granting", () => {
  it("lets the owner give any role but Owner, and audits the change", async () => {
    as(u.owner);
    const manager = await role("ADMIN");
    expect(await updateTeamRole({ organisationSlug: org.slug, targetUserId: u.t1, roleId: manager })).toEqual({ ok: true });
    expect(await member(u.t1)).toMatchObject({ roleId: manager, role: "ADMIN" });
    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { organisationId: org.id, action: "TEAM_ROLE_CHANGED" }, orderBy: { createdAt: "desc" } });
    expect(audit.metadata).toEqual({ fromRoleId: await role("VIEWER"), toRoleId: manager });
    expect(await updateTeamRole({ organisationSlug: org.slug, targetUserId: u.t2, roleId: await role("OWNER") })).toMatchObject({ ok: false });
  });

  it("lets an org-wide manager manage Treasurer and Viewer, but not Manager", async () => {
    as(u.manager);
    expect(await updateTeamRole({ organisationSlug: org.slug, targetUserId: u.t2, roleId: await role("TREASURER") })).toEqual({ ok: true });
    expect(await updateTeamRole({ organisationSlug: org.slug, targetUserId: u.t2, roleId: await role("ADMIN") })).toMatchObject({ ok: false });
    expect(await updateTeamRole({ organisationSlug: org.slug, targetUserId: u.t1, roleId: await role("VIEWER") })).toMatchObject({ ok: false });
    expect(await removeTeamMember({ organisationSlug: org.slug, targetUserId: u.t1 })).toMatchObject({ ok: false });
    expect(await removeTeamMember({ organisationSlug: org.slug, targetUserId: u.owner })).toMatchObject({ ok: false });
    expect(await updateTeamRole({ organisationSlug: org.slug, targetUserId: u.t2, roleId: await role("VIEWER") })).toEqual({ ok: true });
  });

  it("keeps a scoped manager inside their own subtree and never org-wide", async () => {
    as(u.scoped);
    expect(await setTeamMemberUnit({ organisationSlug: org.slug, targetUserId: u.t3, unitId: units.north.id })).toEqual({ ok: true });
    expect((await member(u.t3)).unitId).toBe(units.north.id);
    expect(await prisma.auditEvent.findFirst({ where: { organisationId: org.id, action: "TEAM_UNIT_SCOPE_CHANGED" }, orderBy: { createdAt: "desc" } })).toMatchObject({ metadata: { fromUnitId: units.ward.id, toUnitId: units.north.id } });
    expect(await setTeamMemberUnit({ organisationSlug: org.slug, targetUserId: u.t3, unitId: null })).toMatchObject({ ok: false });
    expect(await setTeamMemberUnit({ organisationSlug: org.slug, targetUserId: u.t3, unitId: units.south.id })).toMatchObject({ ok: false });
    expect(await setTeamMemberUnit({ organisationSlug: org.slug, targetUserId: u.t4, unitId: units.north.id })).toMatchObject({ ok: false });
    expect(await removeTeamMember({ organisationSlug: org.slug, targetUserId: u.t4 })).toMatchObject({ ok: false });
    expect(await updateTeamRole({ organisationSlug: org.slug, targetUserId: u.t2, roleId: await role("TREASURER") })).toMatchObject({ ok: false });
    expect(await createOrgInvite({ organisationSlug: org.slug, roleId: await role("VIEWER") })).toMatchObject({ ok: false });
    expect(await createOrgInvite({ organisationSlug: org.slug, roleId: await role("VIEWER"), unitId: units.south.id })).toMatchObject({ ok: false });
    expect(await createOrgInvite({ organisationSlug: org.slug, roleId: await role("ADMIN"), unitId: units.ward.id })).toMatchObject({ ok: false });
    // Treasurer for the whole organisation needs the org-wide accounts and GSTR-1 permissions they don't hold.
    expect(await createOrgInvite({ organisationSlug: org.slug, roleId: await role("TREASURER") })).toMatchObject({ ok: false });
    expect(await createOrgInvite({ organisationSlug: org.slug, roleId: await role("VIEWER"), unitId: units.ward.id })).toMatchObject({ ok: true });
  });

  it("refuses a treasurer, who can't manage the team", async () => {
    as(u.treasurer);
    expect(await updateTeamRole({ organisationSlug: org.slug, targetUserId: u.t2, roleId: await role("VIEWER") })).toEqual({ ok: false, error: "Your role doesn't allow this." });
    expect(await createOrgInvite({ organisationSlug: org.slug, roleId: await role("VIEWER") })).toMatchObject({ ok: false });
  });

  it("never lets anyone change or remove themselves here", async () => {
    as(u.manager);
    expect(await updateTeamRole({ organisationSlug: org.slug, targetUserId: u.manager, roleId: await role("VIEWER") })).toMatchObject({ ok: false });
    expect(await setTeamMemberUnit({ organisationSlug: org.slug, targetUserId: u.manager, unitId: units.north.id })).toMatchObject({ ok: false });
    expect(await removeTeamMember({ organisationSlug: org.slug, targetUserId: u.manager })).toMatchObject({ ok: false });
    as(u.owner);
    expect(await updateTeamRole({ organisationSlug: org.slug, targetUserId: u.owner, roleId: await role("ADMIN") })).toMatchObject({ ok: false });
  });

  it("checks an invite again when it is accepted", async () => {
    as(u.manager);
    const token = await invite({ roleId: await role("TREASURER") });
    const unitToken = await invite({ roleId: await role("VIEWER"), unitId: units.south.id });
    as(u.owner);
    expect(await updateTeamRole({ organisationSlug: org.slug, targetUserId: u.manager, roleId: await role("TREASURER") })).toEqual({ ok: true });
    const late = await person("late");
    expect(await accept(token, late)).toEqual({ ok: false, reason: "unavailable" });
    expect(await updateTeamRole({ organisationSlug: org.slug, targetUserId: u.manager, roleId: await role("ADMIN") })).toEqual({ ok: true });
    expect(await accept(token, late)).toMatchObject({ ok: true });
    expect(await member(late.id)).toMatchObject({ roleId: await role("TREASURER"), unitId: null });

    await prisma.orgUnit.update({ where: { id: units.south.id }, data: { archivedAt: new Date() } });
    const other = await person("other");
    expect(await accept(unitToken, other)).toEqual({ ok: false, reason: "unavailable" });
    await prisma.orgUnit.update({ where: { id: units.south.id }, data: { archivedAt: null } });
    expect(await accept(unitToken, other)).toMatchObject({ ok: true });
    expect(await member(other.id)).toMatchObject({ unitId: units.south.id });
  });

  it("refuses an invite to an archived role", async () => {
    as(u.owner);
    const custom = await prisma.orgRole.create({ data: { organisationId: org.id, name: `Collector ${suffix}`, capabilities: ["org.view", "members.view"], sortOrder: 9 } });
    const token = await invite({ roleId: custom.id });
    await prisma.orgRole.update({ where: { id: custom.id }, data: { archivedAt: new Date() } });
    expect(await accept(token, await person("archived"))).toEqual({ ok: false, reason: "unavailable" });
  });

  it("enforces the team size limit when an invite is accepted", async () => {
    as(u.owner);
    const token = await invite({ roleId: await role("VIEWER") });
    const size = await prisma.teamMember.count({ where: { organisationId: org.id } });
    await prisma.organisation.update({ where: { id: org.id }, data: { managerLimit: size } });
    const joiner = await person("joiner");
    expect(await accept(token, joiner)).toEqual({ ok: false, reason: "team-full" });
    await prisma.organisation.update({ where: { id: org.id }, data: { managerLimit: size + 1 } });
    expect(await accept(token, joiner)).toMatchObject({ ok: true });
    await prisma.organisation.update({ where: { id: org.id }, data: { managerLimit: null } });
  });

  it("accepts the super-admin's owner invite without an inviter on the team", async () => {
    const fresh = await prisma.organisation.create({ data: { name: "Fresh", slug: `fresh-${suffix}`, status: "ACTIVE" } });
    orgIds.push(fresh.id);
    const admin = await person("platform", { isSuperAdmin: true });
    const owner = await person("fresh-owner");
    const ownerRoleId = (await starterRole(fresh.id, "OWNER")).id;
    const token = `owner-${randomUUID()}`;
    await prisma.teamInvite.create({ data: { organisationId: fresh.id, token, role: "OWNER", roleId: ownerRoleId, email: owner.email, createdByUserId: admin.id } });
    expect(await accept(token, owner)).toMatchObject({ ok: true });
    expect(await member(owner.id, fresh.id)).toMatchObject({ roleId: ownerRoleId, role: "OWNER" });
  });
});
