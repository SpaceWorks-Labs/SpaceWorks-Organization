import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (mocks.userId ? { user: { id: mocks.userId } } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { updateStaffRole } from "@/app/actions/staff-roles";
import { addStaff, starterRole } from "../helpers/staff";

// The previous release writes these tables with raw column lists that know nothing of roleId or code; migration 0017
// keeps it working against this schema after `update.sh --rollback`.
const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const orgIds: string[] = [];
const userIds: string[] = [];

async function user(name: string) {
  const created = await prisma.user.create({ data: { email: `${name}-${suffix}@example.test`, name, emailVerified: new Date(), mfaEnabledAt: new Date() } });
  userIds.push(created.id);
  return created.id;
}

async function organisation(name: string) {
  const created = await prisma.organisation.create({ data: { name, slug: `${name.toLowerCase().replace(/ /g, "-")}-${suffix}`, status: "ACTIVE", unitLevels: ["Area"] } });
  orgIds.push(created.id);
  return created;
}

const roleOf = async (memberId: string) => (await prisma.teamMember.findUniqueOrThrow({ where: { id: memberId }, include: { orgRole: true } })).orgRole;

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  for (const id of orgIds) {
    await prisma.teamInvite.deleteMany({ where: { organisationId: id } });
    await prisma.teamMember.deleteMany({ where: { organisationId: id } });
    await prisma.organisation.delete({ where: { id } }).catch(() => undefined);
  }
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe.sequential("an older release writing to this schema", () => {
  it("gives a team member written with only the fixed role its starter role, creating the starter roles if missing", async () => {
    const org = await organisation("Older Network");
    const person = await user("older-owner");
    await prisma.$executeRaw`INSERT INTO "TeamMember" ("id", "userId", "organisationId", "role") VALUES (${`tm-${suffix}`}, ${person}, ${org.id}, 'OWNER')`;
    expect(await prisma.orgRole.count({ where: { organisationId: org.id, starterKey: { not: null } } })).toBe(4);
    expect(await roleOf(`tm-${suffix}`)).toMatchObject({ isOwner: true, starterKey: "OWNER" });
  });

  it("gives an invite written with only the fixed role its starter role", async () => {
    const org = await organisation("Invite Network");
    await prisma.$executeRaw`INSERT INTO "TeamInvite" ("id", "organisationId", "token", "role") VALUES (${`ti-${suffix}`}, ${org.id}, ${`tok-${suffix}`}, 'TREASURER')`;
    const invite = await prisma.teamInvite.findUniqueOrThrow({ where: { id: `ti-${suffix}` }, include: { orgRole: true } });
    expect(invite.orgRole).toMatchObject({ name: "Treasurer", starterKey: "TREASURER" });
  });

  it("moves someone whose fixed role an older release changed", async () => {
    const org = await organisation("Change Network");
    const member = await addStaff(org.id, await user("changing"), "VIEWER");
    await prisma.$executeRaw`UPDATE "TeamMember" SET "role" = 'ADMIN' WHERE "id" = ${member.id}`;
    expect(await roleOf(member.id)).toMatchObject({ name: "Manager", starterKey: "ADMIN" });
  });

  it("codes a unit created without one", async () => {
    const org = await organisation("Unit Network");
    await prisma.$executeRaw`INSERT INTO "OrgUnit" ("id", "organisationId", "name", "slug", "path") VALUES (${`ou1-${suffix}`}, ${org.id}, 'North', 'north', ${`ou1-${suffix}`})`;
    await prisma.$executeRaw`INSERT INTO "OrgUnit" ("id", "organisationId", "name", "slug", "path") VALUES (${`ou2-${suffix}`}, ${org.id}, 'North two', 'north-2', ${`ou2-${suffix}`})`;
    const codes = (await prisma.orgUnit.findMany({ where: { organisationId: org.id }, orderBy: { createdAt: "asc" } })).map((unit) => unit.code);
    expect(codes).toEqual(["NORTH", "NORTH2"]);
  });
});

describe.sequential("this release keeping the fixed role in step", () => {
  it("narrows holders' fixed role when their custom role is narrowed, without moving them", async () => {
    const org = await organisation("Edit Network");
    const owner = await user("editing-owner");
    await addStaff(org.id, owner, "OWNER");
    const custom = await prisma.orgRole.create({ data: { organisationId: org.id, name: "Area lead", capabilities: (await starterRole(org.id, "TREASURER")).capabilities } });
    const holder = await prisma.teamMember.create({ data: { organisationId: org.id, userId: await user("area-lead"), roleId: custom.id, role: "TREASURER" } });
    mocks.userId = owner;
    expect(await updateStaffRole({ organisationSlug: org.slug, roleId: custom.id, name: "Area lead", description: "", capabilities: ["org.view", "members.view", "reports.membership", "payments.view"] })).toEqual({ ok: true });
    const after = await prisma.teamMember.findUniqueOrThrow({ where: { id: holder.id } });
    expect(after).toMatchObject({ roleId: custom.id, role: "VIEWER" });
  });
});
