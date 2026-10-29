import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ current: null as null | { id: string } }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.current ? { user: identity.current } : null) }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimitById: async () => true }));

import { prisma } from "@/lib/db";
import { decideTerm, openTerm, upsertMember } from "@/lib/membership/service";
import { authorizeCardAccess } from "@/lib/cards/access";
import { ownPayment, ownTerm, payLinkTerm } from "@/lib/payments/memberAccess";
import { payLinkToken } from "@/lib/payments/payLink";
import { loadOrgMembersDirectory } from "@/lib/views/app__dashboard__orgSlug__members__page";
import { loadPaymentsDirectory } from "@/lib/views/app__dashboard__orgSlug__payments__page";
import { GET as exportMembers } from "@/app/api/exports/members/[orgSlug]/route";
import { ROLE_TEMPLATES } from "@/lib/team/capabilities";
import { addStaff } from "../helpers/staff";
import { removePaymentsOrg } from "./payments-helpers";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const users: Record<string, string> = {};
const units: Record<string, string> = {};
const terms: Record<string, string> = {};
let org: { id: string; slug: string; timezone: string; financialYearStartMonth: number };
let paymentId: string;
const ashaEmail = `asha-${suffix}@example.test`;

const as = (key: string | null) => {
  identity.current = key ? { id: users[key]! } : null;
};
const params = () => ({ params: Promise.resolve({ orgSlug: org.slug }) });

async function customRole(name: string, capabilities: string[]) {
  return prisma.orgRole.create({ data: { organisationId: org.id, name, capabilities, sortOrder: 10 } });
}

beforeAll(async () => {
  process.env.AUTH_SECRET ??= "contact-access-test-secret-0123456789abcdef";
  const created = await prisma.organisation.create({ data: { name: "Contact Club", slug: `contact-${suffix}`, status: "ACTIVE" } });
  org = { id: created.id, slug: created.slug, timezone: created.timezone, financialYearStartMonth: created.financialYearStartMonth };
  const plan = await prisma.membershipPlan.create({ data: { organisationId: org.id, name: "Annual", slug: `annual-${suffix}`, currency: "INR", priceNewMinor: 0, priceRenewalMinor: 0, joinMode: "APPROVAL" } });
  for (const key of ["north", "south"]) {
    const unit = await prisma.orgUnit.create({ data: { organisationId: org.id, name: key, slug: key, code: key.toUpperCase(), level: 0, path: "pending" } });
    await prisma.orgUnit.update({ where: { id: unit.id }, data: { path: unit.id } });
    units[key] = unit.id;
  }
  for (const key of ["owner", "clerk", "secretary", "asha"]) {
    const email = key === "asha" ? ashaEmail : `${key}-staff-${suffix}@example.test`;
    users[key] = (await prisma.user.create({ data: { email, emailVerified: new Date(), mfaEnabledAt: key === "asha" ? null : new Date() } })).id;
  }
  await addStaff(org.id, users.owner!, "OWNER");
  // Sees, exports and searches members and payments, but not their contact details.
  const clerk = await customRole("Clerk", ["org.view", "members.view", "members.export", "payments.view"]);
  await prisma.teamMember.create({ data: { organisationId: org.id, userId: users.clerk!, role: "VIEWER", roleId: clerk.id } });
  const template = ROLE_TEMPLATES.find((role) => role.name === "Unit secretary")!;
  const secretary = await customRole("Unit secretary", [...template.capabilities]);
  await prisma.teamMember.create({ data: { organisationId: org.id, userId: users.secretary!, role: "VIEWER", roleId: secretary.id, unitId: units.north } });
  for (const [key, name, unit] of [["asha", "Asha Menon", "north"], ["chitra", "Chitra Nair", "south"]] as const) {
    terms[key] = await prisma.$transaction(async (tx) => {
      const member = await upsertMember(tx, org.id, { email: `${key}-${suffix}@example.test`, name, phone: "+919800000000", source: "JOIN_FORM" });
      await tx.member.update({ where: { id: member.id }, data: { unitId: units[unit] } });
      const term = await openTerm(tx, { org, plan, memberId: member.id, byManager: false, actorUserId: null });
      await decideTerm(tx, { org, termId: term.id, action: "approve", actorUserId: users.owner! });
      return term.id;
    });
  }
  const asha = await prisma.member.findFirstOrThrow({ where: { organisationId: org.id, email: ashaEmail } });
  paymentId = (await prisma.payment.create({ data: { organisationId: org.id, memberId: asha.id, termId: terms.asha, provider: "OFFLINE", currency: "INR", amountMinor: 50_000, taxSnapshot: {} } })).id;
});

afterAll(async () => {
  identity.current = null;
  await prisma.memberCard.deleteMany({ where: { organisationId: org.id } });
  await removePaymentsOrg(org.id, Object.values(users));
  await prisma.$disconnect();
});

describe.sequential("contact details and member access", () => {
  it("blanks email and phone in the member export for staff without members.contact", async () => {
    as("owner");
    const full = await (await exportMembers(new Request("http://localhost/"), params())).text();
    expect(full).toContain(ashaEmail);
    expect(full).toContain("+919800000000");
    as("clerk");
    const response = await exportMembers(new Request("http://localhost/"), params());
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("Asha Menon");
    expect(text).not.toContain(ashaEmail);
    expect(text).not.toContain("+919800000000");
  });

  it("searches members and payments by email only for staff who may see email addresses", async () => {
    const q = `asha-${suffix}`;
    as("owner");
    expect((await loadOrgMembersDirectory({ ...params(), searchParams: Promise.resolve({ q }) })).total).toBe(1);
    expect((await loadPaymentsDirectory({ ...params(), searchParams: Promise.resolve({ q }) })).total).toBe(1);
    as("clerk");
    expect((await loadOrgMembersDirectory({ ...params(), searchParams: Promise.resolve({ q }) })).total).toBe(0);
    expect((await loadPaymentsDirectory({ ...params(), searchParams: Promise.resolve({ q }) })).total).toBe(0);
    expect((await loadOrgMembersDirectory({ ...params(), searchParams: Promise.resolve({ q: "Asha" }) })).total).toBe(1);
    expect((await loadPaymentsDirectory({ ...params(), searchParams: Promise.resolve({ q: "Asha" }) })).total).toBe(1);
  });

  it("lets a unit secretary (cards.manage, no contact) open one card inside their unit only", async () => {
    const north = await prisma.memberCard.findFirstOrThrow({ where: { organisationId: org.id, member: { unitId: units.north } } });
    const south = await prisma.memberCard.findFirstOrThrow({ where: { organisationId: org.id, member: { unitId: units.south } } });
    as("secretary");
    expect(await authorizeCardAccess(north.id)).toEqual({ userId: users.secretary, as: "team" });
    expect(await authorizeCardAccess(south.id)).toBeNull();
    as("clerk");
    expect(await authorizeCardAccess(north.id)).toBeNull();
    as("asha");
    expect(await authorizeCardAccess(north.id)).toEqual({ userId: users.asha, as: "member" });
  });

  it("reaches a member's own term and payment only while member accounts are on; pay links keep working", async () => {
    as("asha");
    expect((await ownTerm(terms.asha!))?.term.id).toBe(terms.asha);
    expect((await ownPayment(paymentId))?.id).toBe(paymentId);
    await prisma.organisation.update({ where: { id: org.id }, data: { memberPortal: false } });
    expect(await ownTerm(terms.asha!)).toBeNull();
    expect(await ownPayment(paymentId)).toBeNull();
    expect((await payLinkTerm(payLinkToken(terms.asha!)))?.term.id).toBe(terms.asha);
    await prisma.organisation.update({ where: { id: org.id }, data: { memberPortal: true } });
  });
});
