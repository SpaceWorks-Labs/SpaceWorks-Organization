import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (mocks.userId ? { user: { id: mocks.userId } } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { createUnit } from "@/app/actions/units";
import { setReportDigest } from "@/app/actions/report-digest";
import { createOrgInvite } from "@/app/actions/org-invites";
import { startOwnershipTransfer } from "@/app/actions/ownership";
import { acceptOrganisationInviteToken } from "@/lib/inviteAcceptance";
import { getMembership, orgActionAccess, STAFF_AUTHENTICATOR_MESSAGE } from "@/lib/permissions";
import { addStaff, starterRole } from "../helpers/staff";

// Owner decision (2026-10-29): super admins have full owner-level access to every organisation, audited, with an
// authenticator, and never on the team.
const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
let org: { id: string; slug: string };
const people: Record<string, string> = {};

async function person(key: string, data: { isSuperAdmin?: boolean; emailVerified?: Date | null; mfaEnabledAt?: Date | null }) {
  const created = await prisma.user.create({ data: { email: `${key}-${suffix}@example.test`, name: key, emailVerified: new Date(), mfaEnabledAt: new Date(), ...data } });
  people[key] = created.id;
}

beforeAll(async () => {
  const created = await prisma.organisation.create({ data: { name: "Example Network", slug: `platform-${suffix}`, status: "ACTIVE", unitLevels: ["Area"] } });
  org = { id: created.id, slug: created.slug };
  await person("owner", {});
  await person("admin", { isSuperAdmin: true });
  await person("unverified-admin", { isSuperAdmin: true, emailVerified: null });
  await person("admin-without-app", { isSuperAdmin: true, mfaEnabledAt: null });
  await person("stranger", {});
  await person("invitee", {});
  await addStaff(org.id, people.owner, "OWNER");
});

afterAll(async () => {
  if (org) {
    await prisma.teamMember.deleteMany({ where: { organisationId: org.id } });
    await prisma.organisation.delete({ where: { id: org.id } }).catch(() => undefined);
  }
  await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: Object.values(people) } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(people) } } });
  await prisma.$disconnect();
});

describe.sequential("platform access", () => {
  it("lets a super admin act in any organisation as its owner, and records it", async () => {
    mocks.userId = people.admin;
    const result = await createUnit({ organisationSlug: org.slug, name: "North", slug: `north-${suffix}`, code: "NTH" });
    expect(result.ok).toBe(true);
    const audit = await prisma.auditEvent.findFirst({ where: { organisationId: org.id, actorUserId: people.admin, action: "SUPER_ADMIN_ORG_ACTION" } });
    expect(audit?.metadata).toMatchObject({ capability: "structure.manage" });
    expect(await prisma.auditEvent.count({ where: { organisationId: org.id, actorUserId: people.admin, action: "UNIT_CREATED" } })).toBe(1);
  });

  it("never puts them on the team", async () => {
    const membership = await getMembership(people.admin, org.id);
    expect(membership).toMatchObject({ superAdmin: true, unitId: null, orgRole: { isOwner: true } });
    expect(await prisma.teamMember.count({ where: { organisationId: org.id, userId: people.admin } })).toBe(0);
    mocks.userId = people.admin;
    expect(await setReportDigest({ organisationSlug: org.slug, enabled: true })).toMatchObject({ ok: false });
  });

  it("still needs a verified email and an authenticator", async () => {
    mocks.userId = people["unverified-admin"];
    expect(await orgActionAccess(org.slug, "members.view")).toEqual({ ok: false, error: "Organisation not found." });
    mocks.userId = people["admin-without-app"];
    expect(await orgActionAccess(org.slug, "members.view")).toEqual({ ok: false, error: STAFF_AUTHENTICATOR_MESSAGE });
  });

  it("gives everyone else nothing", async () => {
    mocks.userId = people.stranger;
    expect(await orgActionAccess(org.slug, "members.view")).toEqual({ ok: false, error: "Organisation not found." });
    expect(await getMembership(people.stranger, org.id)).toBeNull();
  });

  it("lets a staff invite sent through platform access be accepted, checked as an organisation-wide owner's", async () => {
    mocks.userId = people.admin;
    const invite = await createOrgInvite({ organisationSlug: org.slug, roleId: (await starterRole(org.id, "ADMIN")).id });
    expect(invite.ok).toBe(true);
    const token = invite.ok ? invite.data!.token : "";
    expect(await acceptOrganisationInviteToken(token, { id: people.invitee, email: `invitee-${suffix}@example.test`, emailVerified: true })).toEqual({ ok: true, href: `/dashboard/${org.slug}` });
    expect(await prisma.teamMember.findFirst({ where: { organisationId: org.id, userId: people.invitee }, include: { orgRole: true } })).toMatchObject({ unitId: null, orgRole: { name: "Manager" } });
  });

  it("can't transfer ownership through platform access", async () => {
    mocks.userId = people.admin;
    const keep = await starterRole(org.id, "ADMIN");
    expect(await startOwnershipTransfer({ organisationSlug: org.slug, targetUserId: people.owner, keepRoleId: keep.id })).toEqual({ ok: false, error: "Platform access can't transfer ownership; the organisation's owner does that." });
    expect(await prisma.ownershipTransfer.count({ where: { organisationId: org.id } })).toBe(0);
  });
});
