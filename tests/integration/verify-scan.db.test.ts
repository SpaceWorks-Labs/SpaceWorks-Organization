import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ current: null as null | { id: string } }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.current ? { user: identity.current } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { decideTerm, openTerm, upsertMember } from "@/lib/membership/service";
import { loadVerifyView } from "@/lib/views/app__verify__token__page";
import { decideMemberships, extendMembership } from "@/app/actions/members";
import { recordPayment } from "@/app/actions/payments";
import { revokeMemberCard } from "@/app/actions/cards";
import { GET } from "@/app/api/verify/[token]/card/route";
import { membershipViews } from "@/components/members/membershipViews";
import { addStaff } from "../helpers/staff";

// Owner decision: staff who scan a card see only their own organisation's record of the member, and anyone else
// sees the public check with the card itself while it is live and current.
const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const users: Record<string, string> = {};
const units: Record<string, string> = {};
const members: Record<string, { id: string; email: string; termId: string; cardId: string; token: string }> = {};
let org: { id: string; slug: string; timezone: string; financialYearStartMonth: number };
let otherOrgId = "";

const as = (key: string | null) => {
  identity.current = key ? { id: users[key]! } : null;
};
const scan = (token: string) => loadVerifyView({ params: Promise.resolve({ token }) });
const publicPart = ({ view, images, staff }: Awaited<ReturnType<typeof scan>>) => ({ view, images, staff });
const image = (token: string, side = "front") => GET(new Request(`http://localhost/api/verify/${token}/card?side=${side}`), { params: Promise.resolve({ token }) });
const panelOf = async (token: string) => {
  const { staff } = await scan(token);
  if (staff?.state !== "panel") throw new Error(`Expected the staff panel, got ${JSON.stringify(staff)}`);
  return staff;
};

beforeAll(async () => {
  const created = await prisma.organisation.create({ data: { name: "Scan Club", slug: `scan-${suffix}`, status: "ACTIVE", unitLevels: ["Area"] } });
  org = { id: created.id, slug: created.slug, timezone: created.timezone, financialYearStartMonth: created.financialYearStartMonth };
  otherOrgId = (await prisma.organisation.create({ data: { name: "Other Club", slug: `scan-other-${suffix}`, status: "ACTIVE" } })).id;
  const plan = await prisma.membershipPlan.create({ data: { organisationId: org.id, name: "Annual", slug: `annual-${suffix}`, currency: "INR", priceNewMinor: 0, priceRenewalMinor: 0, joinMode: "APPROVAL" } });
  for (const key of ["north", "south"]) {
    const unit = await prisma.orgUnit.create({ data: { organisationId: org.id, name: key, slug: key, code: key.toUpperCase(), level: 0, path: "pending" } });
    await prisma.orgUnit.update({ where: { id: unit.id }, data: { path: unit.id } });
    units[key] = unit.id;
  }
  for (const key of ["owner", "manager", "treasurer", "viewer", "northLead", "southLead", "noAuthenticator", "otherOwner", "superAdmin"]) {
    const user = await prisma.user.create({ data: { email: `${key.toLowerCase()}-${suffix}@example.test`, emailVerified: new Date(), mfaEnabledAt: key === "noAuthenticator" ? null : new Date(), isSuperAdmin: key === "superAdmin" } });
    users[key] = user.id;
  }
  await addStaff(org.id, users.owner!, "OWNER");
  await addStaff(org.id, users.manager!, "ADMIN");
  await addStaff(org.id, users.treasurer!, "TREASURER");
  await addStaff(org.id, users.viewer!, "VIEWER");
  await addStaff(org.id, users.northLead!, "ADMIN", units.north!);
  await addStaff(org.id, users.southLead!, "ADMIN", units.south!);
  await addStaff(org.id, users.noAuthenticator!, "ADMIN");
  await addStaff(otherOrgId, users.otherOwner!, "OWNER");
  for (const [key, unit] of [["asha", "north"], ["binu", "north"], ["chitra", "south"], ["devi", "north"]] as const) {
    const email = `${key}-${suffix}@example.test`;
    const termId = await prisma.$transaction(async (tx) => {
      const member = await upsertMember(tx, org.id, { email, name: `${key[0]!.toUpperCase()}${key.slice(1)} Example`, phone: "+919800000000", source: "JOIN_FORM" });
      await tx.member.update({ where: { id: member.id }, data: { unitId: units[unit] } });
      const term = await openTerm(tx, { org, plan, memberId: member.id, byManager: false, actorUserId: null });
      await decideTerm(tx, { org, termId: term.id, action: "approve", actorUserId: users.owner! });
      return term.id;
    });
    const card = await prisma.memberCard.findFirstOrThrow({ where: { organisationId: org.id, member: { email } } });
    members[key] = { id: card.memberId, email, termId, cardId: card.id, token: card.verifyToken };
  }
});

afterAll(async () => {
  for (const id of [org?.id, otherOrgId].filter(Boolean)) {
    await prisma.$executeRaw`DELETE FROM "OutboxMessage" WHERE "payload"->>'organisationId' = ${id}`;
    await prisma.memberCard.deleteMany({ where: { organisationId: id } });
    await prisma.teamMember.deleteMany({ where: { organisationId: id } });
    await prisma.organisation.delete({ where: { id } }).catch(() => undefined);
  }
  await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: Object.values(users) } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } });
  await prisma.$disconnect();
});

describe.sequential("scanning a card", () => {
  it("shows the public check with the card to anyone not on the organisation's team", async () => {
    as(null);
    const result = await scan(members.asha!.token);
    expect(result.view).toMatchObject({ state: "member", verdict: "valid" });
    expect(result.staff).toBeNull();
    expect(result.images).toEqual({ front: `/api/verify/${members.asha!.token}/card?side=front`, back: `/api/verify/${members.asha!.token}/card?side=back` });
    expect(JSON.stringify(result)).not.toContain(members.asha!.email);
  });

  it("shows owners and managers the member with every action, and records the scan once", async () => {
    as("manager");
    const staff = await panelOf(members.asha!.token);
    expect(staff.member).toMatchObject({ id: members.asha!.id, name: "Asha Example", unitName: "north", contact: { email: members.asha!.email, phone: "+919800000000" } });
    expect(staff.card.state).toBe("live");
    expect(staff.memberships).toHaveLength(1);
    expect(staff.memberships[0]!.status).toBe("ACTIVE");
    expect(staff).toMatchObject({ canManage: true, canManageCards: true, payments: { canManage: true } });
    await scan(members.asha!.token);
    expect(await prisma.auditEvent.count({ where: { action: "CARD_SCANNED", actorUserId: users.manager, organisationId: org.id, targetType: "MemberCard", targetId: members.asha!.cardId } })).toBe(1);
  });

  it("gives each role only the actions its permissions allow", async () => {
    as("treasurer");
    expect(await panelOf(members.asha!.token)).toMatchObject({ canManage: false, canManageCards: false, payments: { canManage: true }, member: { contact: { email: members.asha!.email } } });
    as("viewer");
    const viewer = await panelOf(members.asha!.token);
    expect(viewer).toMatchObject({ canManage: false, canManageCards: false, payments: null, member: { contact: null } });
    expect(JSON.stringify(viewer)).not.toContain(members.asha!.email);
    expect(JSON.stringify(viewer)).not.toContain("+919800000000");
  });

  it("shows unit-limited staff members inside their unit only, and other staff exactly the public check", async () => {
    as(null);
    const anonymous = publicPart(await scan(members.asha!.token));
    as("northLead");
    expect((await panelOf(members.asha!.token)).member.id).toBe(members.asha!.id);
    for (const key of ["southLead", "otherOwner"]) {
      as(key);
      expect(publicPart(await scan(members.asha!.token))).toEqual(anonymous);
    }
    expect(await prisma.auditEvent.count({ where: { action: "CARD_SCANNED", actorUserId: { in: [users.southLead!, users.otherOwner!] } } })).toBe(0);
  });

  it("asks staff without an authenticator to set one up instead of showing the member", async () => {
    as("noAuthenticator");
    const result = await scan(members.asha!.token);
    expect(result.staff).toEqual({ state: "authenticator" });
    expect(JSON.stringify(result)).not.toContain(members.asha!.email);
  });

  it("lets a super admin scan as the owner, recorded as platform access", async () => {
    as("superAdmin");
    expect((await panelOf(members.asha!.token)).canManage).toBe(true);
    expect(await prisma.auditEvent.count({ where: { action: "SUPER_ADMIN_ORG_ENTERED", actorUserId: users.superAdmin, organisationId: org.id } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "CARD_SCANNED", actorUserId: users.superAdmin, organisationId: org.id } })).toBe(1);
  });

  it("still checks permissions and unit scope in the actions the panel calls", async () => {
    const revoke = { organisationSlug: org.slug, termIds: [members.asha!.termId], action: "revoke", reason: "Scanned at the desk" };
    as("viewer");
    expect(await decideMemberships(revoke)).toMatchObject({ ok: false, error: "Your role doesn't allow this." });
    expect(await extendMembership({ organisationSlug: org.slug, termId: members.asha!.termId, lastDay: "2030-03-31", reason: "Scanned at the desk" })).toMatchObject({ ok: false });
    expect(await recordPayment({ organisationSlug: org.slug, termId: members.asha!.termId, method: "cash" })).toMatchObject({ ok: false, error: "Your role doesn't allow this." });
    as("treasurer");
    expect(await revokeMemberCard({ organisationSlug: org.slug, cardId: members.asha!.cardId })).toMatchObject({ ok: false });
    as("southLead");
    expect(await decideMemberships(revoke)).toMatchObject({ ok: false });
    as("otherOwner");
    expect(await decideMemberships(revoke)).toMatchObject({ ok: false, error: "Organisation not found." });
    as("noAuthenticator");
    expect(await decideMemberships(revoke)).toMatchObject({ ok: false });
    expect((await prisma.membershipTerm.findUniqueOrThrow({ where: { id: members.asha!.termId } })).status).toBe("ACTIVE");

    as("manager");
    expect(await extendMembership({ organisationSlug: org.slug, termId: members.asha!.termId, lastDay: "2030-03-31", reason: "Scanned at the desk" })).toEqual({ ok: true });
    const after = await panelOf(members.asha!.token);
    expect(membershipViews(after.memberships, after.org)[0]!.terms[0]!.lastDay).toBe("2030-03-31");
  });

  it("draws the public card as a PNG for a live, current card only", async () => {
    as(null);
    const front = await image(members.asha!.token);
    expect(front.status).toBe(200);
    expect(front.headers.get("content-type")).toBe("image/png");
    expect(front.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await front.arrayBuffer()).subarray(1, 4).toString()).toBe("PNG");
    expect((await image(members.asha!.token, "back")).status).toBe(200);

    expect((await image("not-a-token")).status).toBe(404);
    expect((await image("x".repeat(43))).status).toBe(404);

    as("manager");
    expect(await revokeMemberCard({ organisationSlug: org.slug, cardId: members.binu!.cardId })).toEqual({ ok: true });
    as(null);
    expect((await image(members.binu!.token)).status).toBe(404);
    expect((await scan(members.binu!.token)).images).toBeNull();

    const past = (days: number) => new Date(Date.now() - days * 86_400_000);
    await prisma.membershipTerm.update({ where: { id: members.chitra!.termId }, data: { startsAt: past(800), endsAt: past(400), graceUntil: past(370) } });
    expect((await scan(members.chitra!.token)).view).toMatchObject({ state: "member", verdict: "expired" });
    expect((await image(members.chitra!.token)).status).toBe(404);

    await prisma.member.update({ where: { id: members.devi!.id }, data: { anonymisedAt: new Date() } });
    expect((await image(members.devi!.token)).status).toBe(404);

    await prisma.organisation.update({ where: { id: org.id }, data: { status: "SUSPENDED" } });
    try {
      expect((await image(members.asha!.token)).status).toBe(404);
      expect((await scan(members.asha!.token)).images).toBeNull();
    } finally {
      await prisma.organisation.update({ where: { id: org.id }, data: { status: "ACTIVE" } });
    }
  });
});
