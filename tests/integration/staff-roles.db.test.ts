import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (mocks.userId ? { user: { id: mocks.userId } } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { archiveStaffRole, createStaffRole, reorderStaffRoles, updateStaffRole } from "@/app/actions/staff-roles";
import { loadOrgStaffRolesView } from "@/lib/views/app__dashboard__orgSlug__settings__roles__page";
import { addStaff, starterRole } from "@/tests/helpers/staff";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
let org: { id: string; slug: string };
let other: { id: string; slug: string };
const userIds: string[] = [];
const u: Record<string, string> = {};

async function person(name: string) {
  const user = await prisma.user.create({ data: { email: `${name}-${suffix}@example.test`, name, emailVerified: new Date(), mfaEnabledAt: new Date() } });
  userIds.push(user.id);
  return user.id;
}

const as = (userId: string) => { mocks.userId = userId; };
const slug = () => org.slug;
async function create(name: string, capabilities: string[]) {
  const result = await createStaffRole({ organisationSlug: slug(), name, capabilities });
  if (!result.ok) throw new Error(result.error);
  return result.data!.roleId;
}
const lastAudit = (action: string) => prisma.auditEvent.findFirst({ where: { organisationId: org.id, action }, orderBy: { createdAt: "desc" } });

beforeAll(async () => {
  const created = await prisma.organisation.create({ data: { name: "Roles Club", slug: `roles-club-${suffix}`, status: "ACTIVE", unitLevels: ["Area"] } });
  org = { id: created.id, slug: created.slug };
  const second = await prisma.organisation.create({ data: { name: "Other Club", slug: `other-club-${suffix}`, status: "ACTIVE" } });
  other = { id: second.id, slug: second.slug };
  for (const name of ["owner", "deputy", "scoped", "treasurer"]) u[name] = await person(name);
  await addStaff(org.id, u.owner, "OWNER");
  await addStaff(org.id, u.treasurer, "TREASURER");
  const deputy = await prisma.orgRole.create({ data: { organisationId: org.id, name: "Deputy", capabilities: ["org.view", "members.view", "members.manage", "team.manage", "roles.manage"], sortOrder: 5 } });
  const area = await prisma.orgUnit.create({ data: { organisationId: org.id, name: "Area", slug: `area-${suffix}`, code: "AREA", path: "pending" } });
  await prisma.orgUnit.update({ where: { id: area.id }, data: { path: area.id } });
  await prisma.teamMember.create({ data: { organisationId: org.id, userId: u.deputy, role: "VIEWER", roleId: deputy.id } });
  await prisma.teamMember.create({ data: { organisationId: org.id, userId: u.scoped, role: "VIEWER", roleId: deputy.id, unitId: area.id } });
  await starterRole(other.id, "VIEWER");
});

afterAll(async () => {
  for (const entry of [org, other].filter(Boolean)) {
    await prisma.teamInvite.deleteMany({ where: { organisationId: entry.id } });
    await prisma.teamMember.deleteMany({ where: { organisationId: entry.id } });
    await prisma.organisation.delete({ where: { id: entry.id } }).catch(() => undefined);
  }
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe.sequential("staff roles", () => {
  it("creates a role from grantable permissions with a unique name", async () => {
    as(u.owner);
    const roleId = await create("Area head", ["members.view", "org.view", "members.view", "cards.manage"]);
    expect(await prisma.orgRole.findUniqueOrThrow({ where: { id: roleId } })).toMatchObject({ capabilities: ["org.view", "members.view", "cards.manage"], isOwner: false });
    expect((await lastAudit("STAFF_ROLE_CREATED"))?.metadata).toEqual({ capabilities: "org.view,members.view,cards.manage" });
    expect(await createStaffRole({ organisationSlug: slug(), name: "Area head", capabilities: [] })).toMatchObject({ ok: false, fieldErrors: { name: ["Already used"] } });
    expect(await createStaffRole({ organisationSlug: slug(), name: "A", capabilities: [] })).toMatchObject({ ok: false, fieldErrors: { name: expect.any(Array) } });
    expect(await createStaffRole({ organisationSlug: slug(), name: "Approver", capabilities: ["cards.approve"] })).toMatchObject({ ok: false });
    expect(await createStaffRole({ organisationSlug: slug(), name: "Mystery", capabilities: ["everything"] })).toMatchObject({ ok: false });
  });

  it("audits the permissions an edit adds and removes", async () => {
    as(u.owner);
    const roleId = await create("Collector", ["org.view", "payments.view"]);
    expect(await updateStaffRole({ organisationSlug: slug(), roleId, name: "Collector", capabilities: ["org.view", "payments.manage", "members.view"] })).toEqual({ ok: true });
    expect((await lastAudit("STAFF_ROLE_UPDATED"))?.metadata).toEqual({ added: "members.view,payments.manage", removed: "payments.view", renamed: false });
  });

  it("never edits or archives the Owner role, or another organisation's role", async () => {
    as(u.owner);
    const owner = await starterRole(org.id, "OWNER");
    expect(await updateStaffRole({ organisationSlug: slug(), roleId: owner.id, name: "Boss", capabilities: [] })).toMatchObject({ ok: false });
    expect(await archiveStaffRole({ organisationSlug: slug(), roleId: owner.id, archived: true })).toMatchObject({ ok: false });
    const foreign = await starterRole(other.id, "VIEWER");
    expect(await updateStaffRole({ organisationSlug: slug(), roleId: foreign.id, name: "Mine", capabilities: [] })).toEqual({ ok: false, error: "Role not found." });
  });

  it("refuses to archive a role someone holds or an open invite gives, and archives and restores a free one", async () => {
    as(u.owner);
    const treasurer = await starterRole(org.id, "TREASURER");
    expect(await archiveStaffRole({ organisationSlug: slug(), roleId: treasurer.id, archived: true })).toMatchObject({ ok: false, error: expect.stringContaining("holds this role") });
    const invited = await create("Invited", ["org.view"]);
    await prisma.teamInvite.create({ data: { organisationId: org.id, token: `t-${randomUUID()}`, role: "VIEWER", roleId: invited, createdByUserId: u.owner } });
    expect(await archiveStaffRole({ organisationSlug: slug(), roleId: invited, archived: true })).toMatchObject({ ok: false, error: expect.stringContaining("invite") });
    const free = await create("Spare", ["org.view"]);
    expect(await archiveStaffRole({ organisationSlug: slug(), roleId: free, archived: true })).toEqual({ ok: true });
    expect((await prisma.orgRole.findUniqueOrThrow({ where: { id: free } })).archivedAt).not.toBeNull();
    expect(await lastAudit("STAFF_ROLE_ARCHIVED")).toMatchObject({ targetId: free });
    expect(await archiveStaffRole({ organisationSlug: slug(), roleId: free, archived: false })).toEqual({ ok: true });
    expect((await prisma.orgRole.findUniqueOrThrow({ where: { id: free } })).archivedAt).toBeNull();
  });

  it("lets an editor other than the owner work only within their own permissions, never on their own role", async () => {
    as(u.deputy);
    const roleId = await create("Helper", ["org.view", "members.view"]);
    expect(await updateStaffRole({ organisationSlug: slug(), roleId, name: "Helper", capabilities: ["org.view", "members.manage"] })).toEqual({ ok: true });
    expect(await updateStaffRole({ organisationSlug: slug(), roleId, name: "Helper", capabilities: ["org.view", "members.contact"] })).toMatchObject({ ok: false });
    expect(await createStaffRole({ organisationSlug: slug(), name: "Payer", capabilities: ["payments.manage"] })).toMatchObject({ ok: false });
    const deputy = await prisma.orgRole.findFirstOrThrow({ where: { organisationId: org.id, name: "Deputy" } });
    expect(await updateStaffRole({ organisationSlug: slug(), roleId: deputy.id, name: "Deputy", capabilities: ["org.view"] })).toMatchObject({ ok: false });
    const manager = await starterRole(org.id, "ADMIN");
    expect(await updateStaffRole({ organisationSlug: slug(), roleId: manager.id, name: "Manager", capabilities: ["org.view"] })).toMatchObject({ ok: false });
    expect(await archiveStaffRole({ organisationSlug: slug(), roleId: manager.id, archived: true })).toMatchObject({ ok: false });
  });

  it("never lets an editor other than the owner change a peer's role, or widen one to match their own", async () => {
    as(u.owner);
    const peer = await create("Peer deputy", ["org.view", "members.view", "members.manage", "team.manage", "roles.manage"]);
    as(u.deputy);
    expect(await updateStaffRole({ organisationSlug: slug(), roleId: peer, name: "Peer deputy", capabilities: ["org.view"] })).toMatchObject({ ok: false, error: expect.stringContaining("only the owner") });
    expect(await archiveStaffRole({ organisationSlug: slug(), roleId: peer, archived: true })).toMatchObject({ ok: false });
    expect((await prisma.orgRole.findUniqueOrThrow({ where: { id: peer } })).capabilities).toHaveLength(5);
    const lesser = await create("Lesser", ["org.view"]);
    expect(await updateStaffRole({ organisationSlug: slug(), roleId: lesser, name: "Lesser", capabilities: ["org.view", "members.view", "members.manage", "team.manage", "roles.manage"] })).toMatchObject({ ok: false });
    as(u.owner);
    expect(await archiveStaffRole({ organisationSlug: slug(), roleId: peer, archived: true })).toEqual({ ok: true });
  });

  it("refuses staff for one unit (roles are org-wide to change) and staff without the permission", async () => {
    as(u.scoped);
    expect(await createStaffRole({ organisationSlug: slug(), name: "Unit role", capabilities: ["org.view"] })).toEqual({ ok: false, error: "Only staff for the whole organisation can change this." });
    as(u.treasurer);
    expect(await createStaffRole({ organisationSlug: slug(), name: "Treasurer role", capabilities: ["org.view"] })).toEqual({ ok: false, error: "Your role doesn't allow this." });
  });

  it("reorders roles, keeping the Owner role first", async () => {
    as(u.owner);
    const roles = await prisma.orgRole.findMany({ where: { organisationId: org.id, isOwner: false }, orderBy: { sortOrder: "asc" } });
    const reversed = roles.map((role) => role.id).reverse();
    expect(await reorderStaffRoles({ organisationSlug: slug(), roleIds: reversed })).toEqual({ ok: true });
    const after = await prisma.orgRole.findMany({ where: { organisationId: org.id }, orderBy: { sortOrder: "asc" } });
    expect(after[0].isOwner).toBe(true);
    expect(after.slice(1).map((role) => role.id)).toEqual(reversed);
    const owner = await starterRole(org.id, "OWNER");
    expect(await reorderStaffRoles({ organisationSlug: slug(), roleIds: [owner.id, ...reversed] })).toMatchObject({ ok: false });
  });

  it("lists roles with holders and says which the viewer may edit", async () => {
    as(u.deputy);
    const view = await loadOrgStaffRolesView({ params: Promise.resolve({ orgSlug: org.slug }) });
    const byName = new Map(view.roles.map((role) => [role.name, role]));
    expect(byName.get("Treasurer")).toMatchObject({ holders: 1, lockedReason: expect.any(String) });
    expect(byName.get("Deputy")).toMatchObject({ holders: 2, lockedReason: expect.stringContaining("You hold this role") });
    expect(byName.get("Helper")).toMatchObject({ lockedReason: null });
    expect(byName.get("Peer deputy")).toMatchObject({ lockedReason: expect.stringContaining("only the owner") });
    expect(byName.get("Owner")).toMatchObject({ isOwner: true, lockedReason: expect.any(String) });
    expect(view.allowed.sort()).toEqual(["members.manage", "members.view", "org.view", "roles.manage", "team.manage"]);
  });
});
