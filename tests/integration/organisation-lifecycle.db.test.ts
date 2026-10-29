import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ current: { id: "", email: "" } }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.current.id ? { user: identity.current } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/permissions")>()),
  // Here the platform admin is whoever is signed in.
  requireSuperAdmin: async () => ({ user: identity.current }),
}));

import { prisma } from "@/lib/db";
import { resubmitOrganisationApplication, submitOrganisationApplication } from "@/app/actions/organisation-application";
import { createOrganisationForOwner, reviewOrganisation } from "@/app/actions/super-admin-organisations";
import { createOrgInvite } from "@/app/actions/org-invites";
import { acceptOrganisationInviteToken } from "@/lib/inviteAcceptance";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const users = { applicant: { id: "", email: `applicant-${suffix}@example.test` }, admin: { id: "", email: `admin-${suffix}@example.test` }, unverified: { id: "", email: `unverified-${suffix}@example.test` }, owner: { id: "", email: `owner-${suffix}@example.test` } };
const createdOrgIds: string[] = [];

const application = (overrides: Record<string, unknown> = {}) => ({
  name: "Kochi Runners Club",
  slug: `kochi-runners-${suffix}`,
  kind: "Sports club",
  description: "A running club for everyone in Kochi, with weekly group runs and races.",
  contactEmail: `club-${suffix}@example.test`,
  contactPhone: "",
  website: "",
  addressLine: "",
  city: "Kochi",
  stateCode: "KL",
  postalCode: "682001",
  ...overrides,
});

const signIn = (user: { id: string; email: string }) => {
  identity.current = user;
};

async function outboxFor(organisationId: string) {
  return prisma.$queryRaw<Array<{ kind: string; payload: Record<string, unknown> }>>`
    SELECT "kind", "payload" FROM "OutboxMessage" WHERE "payload"->>'organisationId' = ${organisationId} ORDER BY "createdAt" ASC`;
}

beforeAll(async () => {
  for (const [key, user] of Object.entries(users)) {
    const created = await prisma.user.create({
      data: { email: user.email, emailVerified: key === "unverified" ? null : new Date(), isSuperAdmin: key === "admin", mfaEnabledAt: new Date() },
    });
    user.id = created.id;
  }
});

afterAll(async () => {
  if (createdOrgIds.length) {
    await prisma.$executeRaw`DELETE FROM "OutboxMessage" WHERE "payload"->>'organisationId' = ANY(${createdOrgIds})`;
    await prisma.organisation.deleteMany({ where: { id: { in: createdOrgIds } } });
  }
  await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: Object.values(users).map((user) => user.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users).map((user) => user.id) } } });
  await prisma.$disconnect();
});

describe.sequential("organisation application lifecycle", () => {
  let orgId = "";
  const slug = `kochi-runners-${suffix}`;

  it("refuses an applicant whose email is not verified", async () => {
    signIn(users.unverified);
    const result = await submitOrganisationApplication(application({ slug: `unverified-${suffix}` }));
    expect(result.ok).toBe(false);
    expect(await prisma.organisation.count({ where: { slug: `unverified-${suffix}` } })).toBe(0);
  });

  it("creates a pending organisation owned by the applicant, with history and emails", async () => {
    signIn(users.applicant);
    const result = await submitOrganisationApplication(application());
    expect(result).toEqual({ ok: true, data: { slug } });
    const org = await prisma.organisation.findUniqueOrThrow({ where: { slug }, include: { teamMembers: true, reviews: true } });
    orgId = org.id;
    createdOrgIds.push(org.id);
    expect(org.status).toBe("PENDING_REVIEW");
    expect(org.source).toBe("SELF_SIGNUP");
    expect(org.stateCode).toBe("KL");
    expect(org.teamMembers).toEqual([expect.objectContaining({ userId: users.applicant.id, role: "OWNER" })]);
    expect(org.reviews).toEqual([expect.objectContaining({ action: "SUBMITTED", actorUserId: users.applicant.id, applicationSnapshot: expect.objectContaining({ name: "Kochi Runners Club", slug }) })]);
    const messages = await outboxFor(org.id);
    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "organisation-notice", payload: expect.objectContaining({ to: users.applicant.email, notice: "received" }) }),
      expect.objectContaining({ kind: "organisation-application-alert", payload: expect.objectContaining({ to: users.admin.email }) }),
    ]));
  });

  it("refuses a second application for a taken address", async () => {
    signIn(users.owner);
    const result = await submitOrganisationApplication(application());
    expect(result).toMatchObject({ ok: false, fieldErrors: { slug: ["That web address is taken"] } });
  });

  it("keeps the team out of everything but the application before approval", async () => {
    signIn(users.applicant);
    const invite = await createOrgInvite({ organisationSlug: slug, role: "VIEWER" });
    expect(invite.ok).toBe(false);
  });

  it("needs a note to ask for changes, then tells the owners", async () => {
    signIn(users.admin);
    expect(await reviewOrganisation({ organisationId: orgId, decision: "request-changes" })).toMatchObject({ ok: false });
    expect(await reviewOrganisation({ organisationId: orgId, decision: "request-changes", reason: "Add your PIN code and full address." })).toEqual({ ok: true });
    expect((await prisma.organisation.findUniqueOrThrow({ where: { id: orgId } })).status).toBe("CHANGES_REQUESTED");
    const notices = (await outboxFor(orgId)).filter((message) => message.kind === "organisation-notice");
    expect(notices.at(-1)?.payload).toMatchObject({ notice: "changes-requested", reason: "Add your PIN code and full address." });
  });

  it("lets the owner fix and resend, back into review", async () => {
    signIn(users.applicant);
    const result = await resubmitOrganisationApplication({ ...application({ addressLine: "12 Marine Drive" }), organisationSlug: slug });
    expect(result).toEqual({ ok: true });
    const org = await prisma.organisation.findUniqueOrThrow({ where: { id: orgId }, include: { reviews: { orderBy: { createdAt: "desc" }, take: 1 } } });
    expect(org.status).toBe("PENDING_REVIEW");
    expect(org.addressLine).toBe("12 Marine Drive");
    expect(org.reviews[0]).toMatchObject({ action: "RESUBMITTED" });
    // Already back in review: a second resend is refused.
    expect((await resubmitOrganisationApplication({ ...application(), organisationSlug: slug })).ok).toBe(false);
  });

  it("approves once, and refuses a stale second decision", async () => {
    signIn(users.admin);
    expect(await reviewOrganisation({ organisationId: orgId, decision: "approve" })).toEqual({ ok: true });
    expect((await prisma.organisation.findUniqueOrThrow({ where: { id: orgId } })).status).toBe("ACTIVE");
    expect(await reviewOrganisation({ organisationId: orgId, decision: "approve" })).toMatchObject({ ok: false });
    expect(await reviewOrganisation({ organisationId: orgId, decision: "reject", reason: "late" })).toMatchObject({ ok: false });
  });

  it("opens team management once approved, and closes it again when suspended", async () => {
    signIn(users.applicant);
    const treasurer = await prisma.orgRole.findFirstOrThrow({ where: { organisationId: orgId, starterKey: "TREASURER" } });
    expect((await createOrgInvite({ organisationSlug: slug, roleId: treasurer.id })).ok).toBe(true);
    signIn(users.admin);
    expect(await reviewOrganisation({ organisationId: orgId, decision: "suspend", reason: "Unpaid hosting invoice." })).toEqual({ ok: true });
    signIn(users.applicant);
    expect((await createOrgInvite({ organisationSlug: slug, roleId: treasurer.id })).ok).toBe(false);
    signIn(users.admin);
    expect(await reviewOrganisation({ organisationId: orgId, decision: "reactivate" })).toEqual({ ok: true });
  });

  it("releases a declined organisation's address only after 30 days", async () => {
    signIn(users.owner);
    const declinedSlug = `declined-club-${suffix}`;
    expect((await submitOrganisationApplication(application({ slug: declinedSlug }))).ok).toBe(true);
    const declined = await prisma.organisation.findUniqueOrThrow({ where: { slug: declinedSlug } });
    createdOrgIds.push(declined.id);
    signIn(users.admin);
    expect(await reviewOrganisation({ organisationId: declined.id, decision: "reject", reason: "Not an organisation." })).toEqual({ ok: true });

    signIn(users.applicant);
    expect((await submitOrganisationApplication(application({ slug: declinedSlug }))).ok).toBe(false);
    await prisma.$executeRaw`UPDATE "Organisation" SET "updatedAt" = now() - interval '31 days' WHERE "id" = ${declined.id}`;
    const retry = await submitOrganisationApplication(application({ slug: declinedSlug }));
    expect(retry).toEqual({ ok: true, data: { slug: declinedSlug } });
    const fresh = await prisma.organisation.findUniqueOrThrow({ where: { slug: declinedSlug } });
    createdOrgIds.push(fresh.id);
    expect(fresh.id).not.toBe(declined.id);
    expect((await prisma.organisation.findUniqueOrThrow({ where: { id: declined.id } })).slug).toBe(`declined-${declined.id}`);
  });
});

describe.sequential("platform admin tools", () => {
  it("creates an active organisation whose owner joins by an email-bound invite", async () => {
    signIn(users.admin);
    const result = await createOrganisationForOwner({ ...application({ slug: `direct-${suffix}`, name: "Direct Club" }), ownerEmail: users.owner.email });
    expect(result.ok).toBe(true);
    const organisationId = result.ok ? result.data!.organisationId : "";
    createdOrgIds.push(organisationId);
    const org = await prisma.organisation.findUniqueOrThrow({ where: { id: organisationId }, include: { reviews: true, teamInvites: true, teamMembers: true } });
    expect(org).toMatchObject({ status: "ACTIVE", source: "SUPERADMIN" });
    expect(org.reviews).toEqual([expect.objectContaining({ action: "CREATED" })]);
    expect(org.teamMembers).toEqual([]);
    const [invite] = org.teamInvites;
    expect(invite).toMatchObject({ role: "OWNER", email: users.owner.email });
    expect((await outboxFor(organisationId)).map((message) => message.kind)).toEqual(["owner-invite"]);

    expect(await acceptOrganisationInviteToken(invite.token, { id: users.applicant.id, email: users.applicant.email, emailVerified: true })).toEqual({ ok: false, reason: "wrong-account" });
    expect(await acceptOrganisationInviteToken(invite.token, { id: users.owner.id, email: users.owner.email, emailVerified: true })).toEqual({ ok: true, href: `/dashboard/direct-${suffix}` });
    expect(await prisma.teamMember.findFirst({ where: { organisationId, userId: users.owner.id } })).toMatchObject({ role: "OWNER" });
  });

});
