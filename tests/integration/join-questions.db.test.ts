import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ current: { id: "", email: "" } }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.current.id ? { user: identity.current } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { submitJoin } from "@/app/actions/join";
import { savePlanFields } from "@/app/actions/plans";
import { addStaff } from "../helpers/staff";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const slug = `join-questions-${suffix}`;
const userIds: string[] = [];
let orgId = "";
let owner = { id: "", email: "" };
const plans: Record<string, string> = {};

async function signInNew() {
  const user = await prisma.user.create({ data: { email: `joiner-${randomUUID()}@example.test`, emailVerified: new Date(), name: "Joiner" } });
  userIds.push(user.id);
  identity.current = { id: user.id, email: user.email! };
  return user.email!;
}

function join(planSlug: string, profile: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const form = new FormData();
  form.set("payload", JSON.stringify({ organisationSlug: slug, planSlug, consent: true, profile: { name: "Question Joiner", ...profile }, ...extra }));
  return submitJoin(form);
}

const memberFor = (email: string) => prisma.member.findUniqueOrThrow({ where: { organisationId_email: { organisationId: orgId, email } }, include: { consents: true } });
const question = (key: string, extra: Record<string, unknown> = {}) => ({ key, label: key, type: "TEXT", ...extra });
const saveFields = (plan: string, fields: unknown[]) => {
  identity.current = owner;
  return savePlanFields({ organisationSlug: slug, planId: plans[plan], fields });
};

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: `owner-${suffix}@example.test`, emailVerified: new Date(), name: "Owner", mfaEnabledAt: new Date() } });
  userIds.push(user.id);
  owner = { id: user.id, email: user.email! };
  orgId = (await prisma.organisation.create({ data: { name: "Join questions", slug, status: "ACTIVE" } })).id;
  await addStaff(orgId, owner.id, "OWNER");
  for (const name of ["shirts", "survey", "other", "hidden", "minors", "conflict", "race-a", "race-b"]) {
    const joinFields = name === "hidden" ? { phone: "HIDDEN", state: "HIDDEN" } : name === "minors" ? { minors: false } : {};
    plans[name] = (await prisma.membershipPlan.create({ data: { organisationId: orgId, name, slug: name, joinMode: "OPEN", joinFields } })).id;
  }
  expect(await saveFields("shirts", [question("tshirt", { type: "SELECT", options: ["S", "M"] })])).toEqual({ ok: true });
  expect(await saveFields("survey", [
    question("member_type", { type: "SELECT", options: ["Student", "Professional"], required: true }),
    question("college", { required: true, showIfKey: "member_type", showIfValue: "Student" }),
    question("about", { section: true }),
    question("interests", { type: "LONG_TEXT", multiple: true, options: ["Art", "Music", "Sport, outdoor"] }),
  ])).toEqual({ ok: true });
});

afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM "OutboxMessage" WHERE "payload"->>'organisationId' = ${orgId}`;
  await prisma.organisation.deleteMany({ where: { id: orgId } });
  await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe.sequential("saving a plan's questions", () => {
  it("refuses a key another plan uses differently, archived plans included", async () => {
    await prisma.membershipPlan.update({ where: { id: plans.shirts }, data: { archivedAt: new Date() } });
    const result = await saveFields("other", [question("tshirt")]);
    expect(result).toMatchObject({ ok: false, fieldErrors: { "fields.0.key": ["Another plan uses this key differently"] } });
    expect(await prisma.planField.count({ where: { planId: plans.other } })).toBe(0);
    expect(await saveFields("other", [question("tshirt", { type: "SELECT", options: ["S", "M"] })])).toEqual({ ok: true });
  });

  it("refuses dangling and forward conditions", async () => {
    expect(await saveFields("other", [question("first", { showIfKey: "later", showIfValue: "true" }), question("later", { type: "CHECKBOX" })])).toMatchObject({ ok: false, fieldErrors: { "fields.0.showIfKey": expect.anything() } });
    expect(await saveFields("other", [question("orphan", { showIfKey: "gone", showIfValue: "Yes" })])).toMatchObject({ ok: false });
  });

  it("concurrent saves can't both claim a key with different shapes", async () => {
    const results = await Promise.all([
      saveFields("race-a", [question("race_key")]),
      saveFields("race-b", [question("race_key", { type: "NUMBER" })]),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const types = await prisma.planField.findMany({ where: { organisationId: orgId, key: "race_key" }, select: { type: true } });
    expect(new Set(types.map((field) => field.type)).size).toBe(1);
  });
});

describe.sequential("answering on the join form", () => {
  it("requires a conditional question only when it shows, and drops crafted hidden answers", async () => {
    const student = await signInNew();
    expect(await join("survey", { fieldValues: { member_type: "Student" } })).toMatchObject({ ok: false, fieldErrors: { "fieldValues.college": expect.anything() } });
    expect(await join("survey", { fieldValues: { member_type: "Student", college: "CET" } })).toMatchObject({ ok: true });
    expect((await memberFor(student)).fieldValues).toEqual({ member_type: "Student", college: "CET" });

    const professional = await signInNew();
    expect(await join("survey", { fieldValues: { member_type: "Professional", college: "Crafted", about: "Crafted" } })).toMatchObject({ ok: true });
    expect((await memberFor(professional)).fieldValues).toEqual({ member_type: "Professional" });
  });

  it("stores a multi-select as the chosen options in option order, joined with '; '", async () => {
    const email = await signInNew();
    expect(await join("survey", { fieldValues: { member_type: "Professional", interests: "Sport, outdoor; Art" } })).toMatchObject({ ok: true });
    expect((await memberFor(email)).fieldValues).toMatchObject({ interests: "Art; Sport, outdoor" });
  });

  it("never writes a key that is admin-only on any plan, or shaped differently, from the public form", async () => {
    // Collisions made before saves were checked: written directly, as an older release could have.
    await prisma.planField.createMany({
      data: [
        { organisationId: orgId, planId: plans.conflict, key: "notes", label: "Notes", type: "TEXT", sortOrder: 0 },
        { organisationId: orgId, planId: plans.other, key: "notes", label: "Notes", type: "TEXT", adminOnly: true, sortOrder: 5 },
        { organisationId: orgId, planId: plans.conflict, key: "size", label: "Size", type: "TEXT", sortOrder: 1 },
        { organisationId: orgId, planId: plans.other, key: "size", label: "Size", type: "NUMBER", sortOrder: 6 },
      ],
    });
    const email = await signInNew();
    expect(await join("conflict", { fieldValues: { notes: "public write", size: "XL" } })).toMatchObject({ ok: true });
    expect((await memberFor(email)).fieldValues).toEqual({});
  });
});

describe.sequential("built-in details on the join form", () => {
  it("keeps an existing member's phone and state when the plan hides them", async () => {
    const email = await signInNew();
    await prisma.member.create({ data: { organisationId: orgId, email, name: "Kept", memberNumber: 9100, source: "MANUAL", phone: "+91 98765 43210", stateCode: "KL" } });
    expect(await join("hidden", { phone: "+91 11111 11111", stateCode: "TN" })).toMatchObject({ ok: true });
    expect(await memberFor(email)).toMatchObject({ phone: "+91 98765 43210", stateCode: "KL" });
  });

  it("asks an existing minor for guardian consent even with the under-18 option off", async () => {
    const email = await signInNew();
    await prisma.member.create({ data: { organisationId: orgId, email, name: "Young", memberNumber: 9101, source: "MANUAL", isMinor: true, guardianName: "Parent", guardianEmail: "parent@example.test" } });
    const guardian = { guardianName: "Parent Two", guardianEmail: "parent2@example.test" };
    expect(await join("minors", { isMinor: false, ...guardian })).toMatchObject({ ok: false, fieldErrors: { guardianConsent: expect.anything() } });
    expect(await join("minors", { isMinor: false })).toMatchObject({ ok: false, fieldErrors: { guardianName: expect.anything() } });
    expect(await join("minors", guardian, { guardianConsent: true })).toMatchObject({ ok: true });
    const member = await memberFor(email);
    expect(member).toMatchObject({ isMinor: true, guardianName: "Parent Two" });
    expect(member.consents).toEqual([expect.objectContaining({ byGuardian: true })]);
  });

  it("ignores the under-18 answer when the option is off for a new member", async () => {
    const email = await signInNew();
    expect(await join("minors", { isMinor: true })).toMatchObject({ ok: true });
    const member = await memberFor(email);
    expect(member.isMinor).toBe(false);
    expect(member.consents).toEqual([expect.objectContaining({ byGuardian: false })]);
  });
});
