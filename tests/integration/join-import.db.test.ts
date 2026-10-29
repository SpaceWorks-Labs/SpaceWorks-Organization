import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ current: { id: "", email: "" } }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.current.id ? { user: identity.current } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { addStaff } from "../helpers/staff";
import { createMemberInvite, submitJoin } from "@/app/actions/join";
import { commitMemberImport, previewMemberImport } from "@/app/actions/member-import";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const people: Record<string, { id: string; email: string }> = {};
let orgId = "";
const slug = `kunj-company-${suffix}`;
let unitKochi = "";
let unitBangalore = "";

const signIn = (key: string) => {
  identity.current = people[key];
};
const profile = (name: string, extra: Record<string, unknown> = {}) => ({ name, unitId: unitKochi, ...extra });

beforeAll(async () => {
  for (const key of ["owner", "regional", "shaan", "abhiram", "stranger"]) {
    // Staff need an authenticator before dashboard actions; members don't mind having one.
    const user = await prisma.user.create({ data: { email: `${key}-${suffix}@example.test`, emailVerified: new Date(), name: key, mfaEnabledAt: new Date() } });
    people[key] = { id: user.id, email: user.email! };
  }
  const org = await prisma.organisation.create({ data: { name: "Kunj-Company", slug, status: "ACTIVE", unitLevels: ["Chapter"] } });
  orgId = org.id;
  const kochi = await prisma.orgUnit.create({ data: { organisationId: orgId, name: "Kochi", slug: "kochi", code: "KOCHI", path: "x" } });
  await prisma.orgUnit.update({ where: { id: kochi.id }, data: { path: kochi.id } });
  const blr = await prisma.orgUnit.create({ data: { organisationId: orgId, name: "Bengaluru", slug: "bengaluru", code: "BLR", path: "x" } });
  await prisma.orgUnit.update({ where: { id: blr.id }, data: { path: blr.id } });
  unitKochi = kochi.id;
  unitBangalore = blr.id;
  await addStaff(orgId, people.owner.id, "OWNER");
  await addStaff(orgId, people.regional.id, "ADMIN", kochi.id);
  await prisma.membershipPlan.createMany({
    data: [
      { organisationId: orgId, name: "Open", slug: "open", joinMode: "OPEN" },
      { organisationId: orgId, name: "Invite", slug: "invite", joinMode: "INVITE_ONLY", priceNewMinor: 50_000 },
      { organisationId: orgId, name: "Closed", slug: "closed", joinMode: "CLOSED" },
    ],
  });
});

afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM "OutboxMessage" WHERE "payload"->>'organisationId' = ${orgId}`;
  await prisma.organisation.deleteMany({ where: { id: orgId } });
  await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: Object.values(people).map((p) => p.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(people).map((p) => p.id) } } });
  await prisma.$disconnect();
});

describe.sequential("joining", () => {
  it("joins an open free plan with the account's own email, consent recorded", async () => {
    signIn("shaan");
    const result = await submitJoin({ organisationSlug: slug, planSlug: "open", consent: true, profile: profile("Shaan Shoukath", { email: "spoofed@example.test" }) });
    expect(result).toMatchObject({ ok: true, data: { status: "ACTIVE", termId: expect.any(String) } });
    const member = await prisma.member.findFirstOrThrow({ where: { organisationId: orgId, userId: people.shaan.id }, include: { consents: true } });
    expect(member.email).toBe(people.shaan.email);
    expect(member.consents).toHaveLength(1);
  });

  it("needs a unit when the organisation uses units, and consent", async () => {
    signIn("abhiram");
    expect(await submitJoin({ organisationSlug: slug, planSlug: "open", consent: true, profile: { name: "Abhiram NJ" } })).toMatchObject({ ok: false, fieldErrors: { unitId: expect.anything() } });
    expect(await submitJoin({ organisationSlug: slug, planSlug: "open", consent: false, profile: profile("Abhiram NJ") })).toMatchObject({ ok: false });
  });

  it("refuses invite-only and closed plans without an invite", async () => {
    signIn("abhiram");
    expect(await submitJoin({ organisationSlug: slug, planSlug: "invite", consent: true, profile: profile("Abhiram NJ") })).toMatchObject({ ok: false, error: expect.stringMatching(/invitation/) });
    expect(await submitJoin({ organisationSlug: slug, planSlug: "closed", consent: true, profile: profile("Abhiram NJ") })).toMatchObject({ ok: false });
  });

  it("lets only the invited email use a personal invite, skipping approval", async () => {
    signIn("owner");
    const plan = await prisma.membershipPlan.findFirstOrThrow({ where: { organisationId: orgId, slug: "invite" } });
    const invite = await createMemberInvite({ organisationSlug: slug, planId: plan.id, email: people.abhiram.email, unitId: unitKochi });
    expect(invite.ok).toBe(true);
    const token = invite.ok ? invite.data!.token : "";
    signIn("stranger");
    expect(await submitJoin({ organisationSlug: slug, planSlug: "invite", inviteToken: token, consent: true, profile: profile("Stranger") })).toMatchObject({ ok: false });
    signIn("abhiram");
    expect(await submitJoin({ organisationSlug: slug, planSlug: "invite", inviteToken: token, consent: true, profile: profile("Abhiram NJ") })).toMatchObject({ ok: true, data: { status: "PENDING_PAYMENT", termId: expect.any(String) } });
    expect((await prisma.memberInvite.findUniqueOrThrow({ where: { token } })).uses).toBe(1);
  });
});

describe.sequential("importing", () => {
  const csv = (rows: string[]) => ["Name,Email,Chapter,Designation", ...rows].join("\n");

  it("creates members, then updates them on a second import, skipping bad rows with reasons", async () => {
    signIn("owner");
    const first = await commitMemberImport({
      organisationSlug: slug,
      mapping: ["name", "email", "unit", "skip"],
      source: { kind: "csv", text: csv([`Midlaj C,midlaj-${suffix}@example.test,Kochi,`, `Ajzal P,ajzal-${suffix}@example.test,Bengaluru,`, "No Email,,Kochi,", `Ghost,ghost-${suffix}@example.test,Atlantis,`]) },
    });
    expect(first).toMatchObject({ ok: true, data: { created: 2, updated: 0 } });
    if (first.ok) expect(first.data!.skipped.map((s) => s.row)).toEqual([4, 5]);
    const again = await commitMemberImport({ organisationSlug: slug, mapping: ["name", "email", "unit", "skip"], source: { kind: "csv", text: csv([`Midlaj C (Backend),midlaj-${suffix}@example.test,Kochi,`]) } });
    expect(again).toMatchObject({ ok: true, data: { created: 0, updated: 1 } });
    expect((await prisma.member.findFirstOrThrow({ where: { organisationId: orgId, email: `midlaj-${suffix}@example.test` } })).name).toBe("Midlaj C (Backend)");
  });

  it("keeps a region manager's import inside their unit", async () => {
    signIn("regional");
    const result = await commitMemberImport({
      organisationSlug: slug,
      mapping: ["name", "email", "unit", "skip"],
      source: { kind: "csv", text: csv([`Anin Arafath,anin-${suffix}@example.test,Kochi,`, `Outsider,outsider-${suffix}@example.test,Bengaluru,`]) },
    });
    expect(result).toMatchObject({ ok: true, data: { created: 1 } });
    if (result.ok) expect(result.data!.skipped).toEqual([{ row: 3, reason: "Outside your unit" }]);
    expect(unitBangalore).toBeTruthy();
  });

  it("never takes over a member filed outside a region manager's unit, in the preview or any import mode", async () => {
    signIn("regional");
    // Filed in Bengaluru by the owner's import above; the row would move them into Kochi.
    const email = `ajzal-${suffix}@example.test`;
    const request = { organisationSlug: slug, mapping: ["name", "email", "unit", "skip"], source: { kind: "csv", text: csv([`Taken Over,${email},Kochi,`]) } };
    expect(await previewMemberImport(request)).toMatchObject({ ok: true, data: { ready: 0, problems: [{ row: 2, reason: "Outside your unit" }] } });
    const plan = await prisma.membershipPlan.findFirstOrThrow({ where: { organisationId: orgId, slug: "open" } });
    for (const membership of ["none", "start", "verify"] as const) {
      const result = await commitMemberImport({ ...request, planId: plan.id, membership });
      expect(result).toMatchObject({ ok: true, data: { created: 0, updated: 0, waiting: 0, skipped: [{ row: 2, reason: "Outside your unit" }] } });
    }
    const member = await prisma.member.findFirstOrThrow({ where: { organisationId: orgId, email }, include: { terms: true } });
    expect(member).toMatchObject({ name: "Ajzal P", unitId: unitBangalore });
    expect(member.terms).toHaveLength(0);
  });
});
