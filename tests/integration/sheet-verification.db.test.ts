import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ current: { id: "", email: "" } }));
const sent = vi.hoisted(() => ({ emails: [] as Array<Record<string, unknown>> }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.current.id ? { user: identity.current } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email/message", async (original) => ({
  ...(await original<typeof import("@/lib/email/message")>()),
  sendBrandedEmail: async (email: Record<string, unknown>) => { sent.emails.push(email); },
}));

import { prisma } from "@/lib/db";
import { addStaff } from "../helpers/staff";
import { commitMemberImport, previewMemberImport } from "@/app/actions/member-import";
import { decideMemberships } from "@/app/actions/members";
import { resetEmailTemplate, saveEmailTemplate, sendEmailTemplateTest } from "@/app/actions/email-templates";
import { deliverMembershipNotice } from "@/lib/email/membership";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const slug = `example-network-${suffix}`;
const people: Record<string, { id: string; email: string }> = {};
const unitIds: Record<string, string> = {};
let orgId = "";
let planId = "";

const signIn = (key: string) => { identity.current = people[key]; };
const email = (name: string) => `${name}-${suffix}@example.test`;
const csv = (rows: string[]) => ["Name,Email,Unit", ...rows].join("\n");
const source = (rows: string[]) => ({ kind: "csv" as const, text: csv(rows) });
const alerts = async () => (await prisma.outboxMessage.findMany({ where: { kind: "verification-alert", payload: { path: ["organisationId"], equals: orgId } }, select: { id: true, payload: true } }));
const alertCounts = async () => Object.fromEntries((await alerts()).map((row) => {
  const payload = row.payload as { userId: string; count: number };
  return [Object.keys(people).find((key) => people[key].id === payload.userId), payload.count];
}));
const termOf = (name: string) => prisma.membershipTerm.findFirstOrThrow({ where: { organisationId: orgId, member: { email: email(name) } } });

beforeAll(async () => {
  for (const key of ["owner", "manager", "northLead", "north1Lead", "southLead", "viewer"]) {
    const user = await prisma.user.create({ data: { email: email(key), emailVerified: new Date(), name: `${key} Example`, mfaEnabledAt: new Date() } });
    people[key] = { id: user.id, email: user.email! };
  }
  const org = await prisma.organisation.create({ data: { name: "Example Network", slug, status: "ACTIVE", unitLevels: ["Region", "Chapter"] } });
  orgId = org.id;
  const unit = async (name: string, code: string, parent?: { id: string; path: string }) => {
    const created = await prisma.orgUnit.create({ data: { organisationId: orgId, name, slug: name.toLowerCase().replace(/\s+/g, "-"), code, path: "x", parentId: parent?.id ?? null, level: parent ? 1 : 0 } });
    const path = parent ? `${parent.path}/${created.id}` : created.id;
    await prisma.orgUnit.update({ where: { id: created.id }, data: { path } });
    unitIds[name] = created.id;
    return { id: created.id, path };
  };
  const north = await unit("North", "N");
  await unit("North 1", "N1", north);
  await unit("South", "S");
  await addStaff(orgId, people.owner.id, "OWNER");
  await addStaff(orgId, people.manager.id, "ADMIN");
  await addStaff(orgId, people.northLead.id, "ADMIN", unitIds.North);
  await addStaff(orgId, people.north1Lead.id, "ADMIN", unitIds["North 1"]);
  await addStaff(orgId, people.southLead.id, "ADMIN", unitIds.South);
  await addStaff(orgId, people.viewer.id, "VIEWER");
  planId = (await prisma.membershipPlan.create({ data: { organisationId: orgId, name: "Annual", slug: "annual", joinMode: "OPEN" } })).id;
});

afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM "OutboxMessage" WHERE "payload"->>'organisationId' = ${orgId}`;
  await prisma.organisation.deleteMany({ where: { id: orgId } });
  await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: Object.values(people).map((p) => p.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(people).map((p) => p.id) } } });
  await prisma.$disconnect();
});

describe.sequential("sheet onboarding with unit verification", () => {
  it("checks every row in the preview, writing nothing", async () => {
    signIn("owner");
    const result = await previewMemberImport({ organisationSlug: slug, planId, source: source([`Asha Menon,${email("asha")},North 1`, `Bad,not-an-email,North`, `Asha Twice,${email("asha")},North`, `Ghost,${email("ghost")},Atlantis`]) });
    expect(result).toMatchObject({ ok: true, data: { total: 4, ready: 1, mappingError: null, mapping: ["name", "email", "unit"] } });
    if (result.ok) expect(result.data!.problems).toEqual([{ row: 3, reason: "Email address isn't valid" }, { row: 4, reason: "Same email as row 2" }, { row: 5, reason: 'No unit called "Atlantis"' }]);
    expect(await prisma.member.count({ where: { organisationId: orgId } })).toBe(0);
  });

  it("imports into waiting for verification and emails each lead once, never the importer", async () => {
    signIn("owner");
    const result = await commitMemberImport({
      organisationSlug: slug, planId, mapping: ["name", "email", "unit"], membership: "verify",
      source: source([`Asha Menon,${email("asha")},North 1`, `Ravi K,${email("ravi")},n1`, `Meera P,${email("meera")},North`, `Joseph T,${email("joseph")},South`, `Ghost,${email("ghost")},Atlantis`]),
    });
    expect(result).toMatchObject({ ok: true, data: { created: 4, updated: 0, waiting: 4, skipped: [{ row: 6, reason: 'No unit called "Atlantis"' }] } });
    const asha = await termOf("asha");
    expect(asha.status).toBe("PENDING_APPROVAL");
    expect(await prisma.termStatusEvent.findFirst({ where: { termId: asha.id }, select: { cause: true, to: true } })).toEqual({ cause: "sent-to-verify", to: "PENDING_APPROVAL" });
    // No "application received" email to people who never applied: the leads hear once instead.
    expect(await prisma.outboxMessage.count({ where: { kind: "membership-notice", payload: { path: ["termId"], equals: asha.id } } })).toBe(0);
    expect(await alertCounts()).toEqual({ manager: 4, northLead: 3, north1Lead: 2, southLead: 1 });
  });

  it("keeps a scoped importer's rows inside their unit and leaves them out of the alert", async () => {
    await prisma.outboxMessage.deleteMany({ where: { kind: "verification-alert", payload: { path: ["organisationId"], equals: orgId } } });
    signIn("north1Lead");
    const result = await commitMemberImport({ organisationSlug: slug, planId, mapping: ["name", "email", "unit"], membership: "verify", source: source([`Nihal K,${email("nihal")},North 1`, `Fathima R,${email("fathima")},South`]) });
    expect(result).toMatchObject({ ok: true, data: { created: 1, waiting: 1, skipped: [{ row: 3, reason: "Outside your unit" }] } });
    expect(await prisma.member.count({ where: { organisationId: orgId, email: email("fathima") } })).toBe(0);
    expect(await alertCounts()).toEqual({ owner: 1, manager: 1, northLead: 1 });
  });

  it("refuses a lead verifying outside their subtree", async () => {
    signIn("north1Lead");
    const joseph = await termOf("joseph");
    expect(await decideMemberships({ organisationSlug: slug, termIds: [joseph.id], action: "approve" })).toMatchObject({ ok: false });
    expect((await termOf("joseph")).status).toBe("PENDING_APPROVAL");
    signIn("southLead");
    const meera = await termOf("meera");
    expect(await decideMemberships({ organisationSlug: slug, termIds: [meera.id, joseph.id], action: "approve" })).toMatchObject({ ok: true, data: { done: 1, skipped: 1 } });
    expect((await termOf("meera")).status).toBe("PENDING_APPROVAL");
  });

  it("activates on verification, issues the card and queues exactly one card email", async () => {
    signIn("north1Lead");
    const asha = await termOf("asha");
    expect(await decideMemberships({ organisationSlug: slug, termIds: [asha.id], action: "approve" })).toMatchObject({ ok: true, data: { done: 1 } });
    expect((await termOf("asha")).status).toBe("ACTIVE");
    const card = await prisma.memberCard.findFirstOrThrow({ where: { organisationId: orgId, memberId: asha.memberId, revokedAt: null } });
    expect(card.lastEmailedAt).not.toBeNull();
    const cardEmails = () => prisma.outboxMessage.count({ where: { kind: "member-card", payload: { path: ["cardId"], equals: card.id } } });
    expect(await cardEmails()).toBe(1);
    expect(await decideMemberships({ organisationSlug: slug, termIds: [asha.id], action: "approve" })).toMatchObject({ ok: false });
    expect(await cardEmails()).toBe(1);
  });
});

describe.sequential("organisation email templates", () => {
  const wording = { subject: "{organisation} card for {name}", heading: "Welcome to {unit}", body: "Hi {name}, card {cardNumber} on {plan}.\n\nValid until {validUntil}. {unknown} stays." };

  it("uses the standard wording without a template", async () => {
    sent.emails = [];
    const asha = await termOf("asha");
    expect(await deliverMembershipNotice({ termId: asha.id, organisationId: orgId, notice: "activated" }, "m1")).toBe("sent");
    expect(sent.emails[0]).toMatchObject({ subject: "Welcome to Example Network", heading: "Your membership has started", organisationId: orgId });
  });

  it("saves only with the organisation's settings permission held org-wide, audited", async () => {
    signIn("northLead");
    expect(await saveEmailTemplate({ organisationSlug: slug, kind: "membership-activated", ...wording })).toMatchObject({ ok: false });
    signIn("owner");
    expect(await saveEmailTemplate({ organisationSlug: slug, kind: "membership-activated", ...wording, body: "" })).toMatchObject({ ok: false, fieldErrors: { body: expect.anything() } });
    expect(await saveEmailTemplate({ organisationSlug: slug, kind: "membership-activated", ...wording })).toEqual({ ok: true });
    expect(await prisma.auditEvent.count({ where: { organisationId: orgId, action: "ORG_EMAIL_TEMPLATE_SAVED" } })).toBe(1);
  });

  it("renders the saved wording for the member, as escaped paragraphs", async () => {
    sent.emails = [];
    const asha = await termOf("asha");
    const card = await prisma.memberCard.findFirstOrThrow({ where: { organisationId: orgId, memberId: asha.memberId } });
    await deliverMembershipNotice({ termId: asha.id, organisationId: orgId, notice: "activated" }, "m2");
    expect(sent.emails[0]).toMatchObject({
      subject: "Example Network card for Asha Menon",
      heading: "Welcome to North 1",
      paragraphs: [`Hi Asha Menon, card ${card.cardNumber} on Annual.`, expect.stringMatching(/^Valid until \d{1,2} \w{3} \d{4}\. \{unknown\} stays\.$/)],
    });
  });

  it("sends a test to the editor's own address and goes back to the standard wording", async () => {
    sent.emails = [];
    signIn("owner");
    expect(await sendEmailTemplateTest({ organisationSlug: slug, kind: "card-issued", ...wording })).toEqual({ ok: true });
    expect(sent.emails[0]).toMatchObject({ to: people.owner.email, subject: "Test: Example Network card for Asha Menon", organisationId: orgId });
    expect(await resetEmailTemplate({ organisationSlug: slug, kind: "membership-activated" })).toEqual({ ok: true });
    expect(await prisma.orgEmailTemplate.count({ where: { organisationId: orgId } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { organisationId: orgId, action: "ORG_EMAIL_TEMPLATE_RESET" } })).toBe(1);
  });
});
