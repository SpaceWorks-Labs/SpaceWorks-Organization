import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ current: { id: "", email: "" } }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.current.id ? { user: identity.current } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimitById: async () => true }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { upsertMember } from "@/lib/membership/service";
import { lockMemberByEmail } from "@/lib/membership/memberLock";
import { replacePlanAnswers } from "@/lib/membership/planAnswers";
import { updateMember } from "@/app/actions/members";
import { updateMemberProfile } from "@/app/actions/portal";
import { commitMemberImport, previewMemberImport } from "@/app/actions/member-import";
import { GET as exportMembers } from "@/app/api/exports/members/[orgSlug]/route";
import { loadMembershipDetailView } from "@/lib/views/app__account__memberships__orgSlug__page";
import { loadCardOrgContext } from "@/lib/cards/data";
import { memberDetails } from "@/lib/cards/core";
import { addStaff } from "../helpers/staff";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const slug = `answers-${suffix}`;
const people: Record<string, { id: string; email: string }> = {};
const plans: Record<string, string> = {};
let orgId = "";
let memberId = "";
const STACKS = ["Rust, Go", "TypeScript", "Python"];
const signIn = (key: string) => {
  identity.current = people[key];
};
const stored = async () => (await prisma.member.findUniqueOrThrow({ where: { id: memberId } })).fieldValues as Record<string, unknown>;
const field = (planKey: string, key: string, sortOrder: number, extra: Record<string, unknown> = {}) =>
  prisma.planField.create({ data: { organisationId: orgId, planId: plans[planKey], key, label: key, sortOrder, ...extra } as never });

beforeAll(async () => {
  for (const key of ["owner", "asha"]) {
    const user = await prisma.user.create({ data: { email: `${key}-${suffix}@example.test`, emailVerified: new Date(), name: key, mfaEnabledAt: new Date() } });
    people[key] = { id: user.id, email: user.email! };
  }
  orgId = (await prisma.organisation.create({ data: { name: "Answers", slug, status: "ACTIVE" } })).id;
  await addStaff(orgId, people.owner.id, "OWNER");
  for (const [index, key] of ["a", "b", "c"].entries()) {
    plans[key] = (await prisma.membershipPlan.create({ data: { organisationId: orgId, name: key.toUpperCase(), slug: `plan-${key}`, joinMode: "OPEN", sortOrder: index } })).id;
  }
  // Plan A: a shared checkbox and an admin-only key. Plan B: the same checkbox, a question it shows, a section and a list.
  await field("a", "employed", 0, { type: "CHECKBOX" });
  await field("a", "score", 1, { adminOnly: true });
  await field("b", "employed", 0, { type: "CHECKBOX" });
  await field("b", "company", 1, { showIfKey: "employed", showIfValue: "true", required: true });
  await field("b", "work", 2, { section: true });
  await field("b", "stack", 3, { type: "LONG_TEXT", multiple: true, options: STACKS });
  await field("b", "notes", 4);
  await field("c", "other", 0);
  const member = await prisma.$transaction((tx) => upsertMember(tx, orgId, {
    email: people.asha.email, name: "Asha Menon", phone: "+91 98470 00000", stateCode: "KL", isMinor: true, guardianName: "Ravi", guardianEmail: `ravi-${suffix}@example.test`,
    source: "MANUAL", fieldValues: { other: "keep", notes: "old", score: "7" },
  }));
  memberId = member.id;
  for (const key of ["a", "b"]) {
    await prisma.membershipTerm.create({ data: { organisationId: orgId, memberId, planId: plans[key], status: "ACTIVE", currency: "INR", priceMinor: 0, startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 300 * 86_400_000), graceUntil: new Date(Date.now() + 315 * 86_400_000) } });
  }
});

afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM "OutboxMessage" WHERE "payload"->>'organisationId' = ${orgId}`;
  await prisma.organisation.deleteMany({ where: { id: orgId } });
  await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: Object.values(people).map((person) => person.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(people).map((person) => person.id) } } });
  await prisma.$disconnect();
});

const profile = (fieldValues: Record<string, unknown>) => ({ name: "Asha Menon", email: people.asha.email, phone: "+91 98470 00000", stateCode: "KL", isMinor: true, guardianName: "Ravi", guardianEmail: `ravi-${suffix}@example.test`, fieldValues });

describe.sequential("member answers across plans", () => {
  it("keeps omitted phone, state and guardian details, and clears what is passed as null", async () => {
    await prisma.$transaction((tx) => upsertMember(tx, orgId, { email: people.asha.email, name: "Asha Menon", source: "JOIN_FORM" }));
    expect(await prisma.member.findUniqueOrThrow({ where: { id: memberId } })).toMatchObject({ phone: "+91 98470 00000", stateCode: "KL", isMinor: true, guardianName: "Ravi" });
    await prisma.$transaction((tx) => upsertMember(tx, orgId, { email: people.asha.email, name: "Asha Menon", phone: null, source: "JOIN_FORM" }));
    expect(await prisma.member.findUniqueOrThrow({ where: { id: memberId } })).toMatchObject({ phone: null, stateCode: "KL" });
  });

  it("never loses a key when two plans' answers are saved at once", async () => {
    const save = (planKey: string, values: Record<string, unknown>, pause: number) => prisma.$transaction(async (tx) => {
      const locked = await lockMemberByEmail(tx, orgId, people.asha.email);
      await new Promise((resolve) => setTimeout(resolve, pause));
      const fields = await tx.planField.findMany({ where: { planId: plans[planKey] } });
      const fieldValues = replacePlanAnswers((locked?.fieldValues ?? {}) as Record<string, unknown>, fields, values, false);
      return upsertMember(tx, orgId, { email: people.asha.email, name: "Asha Menon", fieldValues, fieldValuesMode: "replace", source: "JOIN_FORM" });
    });
    await Promise.all([save("a", { employed: true }, 300), save("c", { other: "both" }, 0)]);
    expect(await stored()).toMatchObject({ employed: true, other: "both", score: "7", notes: "old" });
  });

  it("lets staff answer the union once per key, clearing emptied and hidden answers and keeping other plans'", async () => {
    signIn("owner");
    expect(await updateMember({ organisationSlug: slug, memberId, profile: profile({ employed: true }) })).toMatchObject({ ok: false, fieldErrors: { "fieldValues.company": ["company is required"] } });
    const saved = await updateMember({ organisationSlug: slug, memberId, profile: profile({ employed: true, company: "Acme", score: "9", stack: "Python; Rust, Go", notes: "" }) });
    expect(saved).toMatchObject({ ok: true });
    expect(await stored()).toEqual({ employed: true, company: "Acme", score: "9", stack: "Rust, Go; Python", other: "both" });
    await updateMember({ organisationSlug: slug, memberId, profile: profile({ employed: false, company: "Acme", score: "9", stack: "Rust, Go; Python" }) });
    expect(await stored()).toEqual({ score: "9", stack: "Rust, Go; Python", other: "both" });
  });

  it("never shows, prefills or writes an admin-only key from the portal", async () => {
    signIn("asha");
    const view = await loadMembershipDetailView({ params: Promise.resolve({ orgSlug: slug }) });
    expect(view.questions.flatMap((plan) => plan.fields.map((entry) => entry.key))).not.toContain("score");
    expect(view.member.fieldValues).toEqual({ stack: "Rust, Go; Python" });
    const result = await updateMemberProfile({ organisationSlug: slug, profile: { name: "Asha Menon", phone: "+91 98470 00000", stateCode: "KL", guardianName: "Ravi", guardianEmail: `ravi-${suffix}@example.test`, fieldValues: { employed: true, company: "Beta", score: "10", other: "portal" } } });
    expect(result).toMatchObject({ ok: true });
    expect(await stored()).toEqual({ employed: true, company: "Beta", score: "9", other: "both" });
  });

  it("checks imported answers the same way in the preview and the import", async () => {
    signIn("owner");
    const request = {
      organisationSlug: slug,
      mapping: ["name", "email", "field:stack"],
      source: { kind: "csv" as const, text: ["Name,Email,Stack", `Asha Menon,${people.asha.email},"Python; Rust, Go"`, `Ravi K,ravi-k-${suffix}@example.test,Go`].join("\n") },
    };
    expect(await previewMemberImport(request)).toMatchObject({ ok: true, data: { ready: 1, problems: [{ row: 3, reason: 'stack: "Go" isn\'t one of the choices' }] } });
    expect(await previewMemberImport({ ...request, mapping: ["name", "email", "field:work"] })).toMatchObject({ ok: true, data: { mappingError: "Match columns only to questions a plan asks." } });
    expect(await commitMemberImport({ ...request, membership: "none" })).toMatchObject({ ok: true, data: { updated: 1, skipped: [{ row: 3, reason: 'stack: "Go" isn\'t one of the choices' }] } });
    expect(await stored()).toEqual({ employed: true, company: "Beta", score: "9", other: "both", stack: "Rust, Go; Python" });
    expect(await prisma.member.findUniqueOrThrow({ where: { id: memberId } })).toMatchObject({ phone: "+91 98470 00000", stateCode: "KL" });
  });

  it("exports the stored list without sections, and prints it on cards with commas", async () => {
    signIn("owner");
    const csv = await (await exportMembers(new Request("http://localhost/"), { params: Promise.resolve({ orgSlug: slug }) })).text();
    const [header, ...rows] = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(header).not.toContain("work");
    expect(rows.find((row) => row.includes("Asha Menon"))).toContain('"Rust, Go; Python"');
    const context = await loadCardOrgContext(orgId);
    expect(memberDetails(context!.fields.get(plans.b) ?? [], await stored())).toEqual([
      { key: "employed", label: "employed", value: "Yes" },
      { key: "company", label: "company", value: "Beta" },
      { key: "stack", label: "stack", value: "Rust, Go, Python" },
    ]);
  });
});
