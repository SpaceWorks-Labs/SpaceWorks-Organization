import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ current: { id: "", email: "" } }));
const seen = vi.hoisted(() => ({ calls: [] as Array<{ organisationId: string; scopes: string[]; termStatus: string | null }>, probe: null as null | (() => Promise<string | null>) }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.current.id ? { user: identity.current } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/cache", () => ({
  invalidateOrg: async (organisationId: string, ...scopes: string[]) => {
    seen.calls.push({ organisationId, scopes, termStatus: seen.probe ? await seen.probe() : null });
  },
}));

import { prisma } from "@/lib/db";
import { addStaff } from "../helpers/staff";
import { decideMemberships, updateMember } from "@/app/actions/members";
import { openTerm, upsertMember } from "@/lib/membership/service";
import { loadMemberHistory } from "@/lib/views/memberHistory";
import { getMembership } from "@/lib/permissions";
import { teamScope } from "@/lib/membership/scope";
import { createPaymentsOrg, people, removePaymentsOrg, suffix } from "./payments-helpers";
import type { OrgForPayments } from "@/lib/payments/charges";

let org: OrgForPayments;
let other: { id: string };
let staff: Array<{ id: string; email: string | null }>;
let planId = "";
let memberId = "";
let termId = "";

const signIn = (index: number) => {
  identity.current = { id: staff[index].id, email: staff[index].email! };
};

beforeAll(async () => {
  ({ org } = await createPaymentsOrg());
  const plan = await prisma.membershipPlan.create({ data: { organisationId: org.id, name: "Free", slug: `free-${suffix}`, currency: "INR", priceNewMinor: 0, priceRenewalMinor: 0, joinMode: "OPEN", paymentMode: "FREE" } });
  planId = plan.id;
  await prisma.planField.create({ data: { organisationId: org.id, planId, key: "shirt", label: "Shirt size", type: "TEXT" } });
  other = await prisma.organisation.create({ data: { name: "Other", slug: `other-${suffix}`, status: "ACTIVE" } });
  staff = await people(2);
  await prisma.user.updateMany({ where: { id: { in: staff.map((person) => person.id) } }, data: { emailVerified: new Date(), mfaEnabledAt: new Date() } });
  await addStaff(org.id, staff[0].id, "OWNER");
  await addStaff(org.id, staff[1].id, "VIEWER");
  const term = await prisma.$transaction(async (tx) => {
    const member = await upsertMember(tx, org.id, { email: `hist-${suffix}@example.test`, name: "History Person", source: "MANUAL" });
    return openTerm(tx, { org, plan, memberId: member.id, byManager: true, actorUserId: staff[0].id });
  });
  memberId = term.memberId;
  termId = term.id;
  seen.probe = async () => (await prisma.membershipTerm.findUnique({ where: { id: termId }, select: { status: true } }))?.status ?? null;
});

afterAll(async () => {
  if (org) {
    await prisma.memberCard.deleteMany({ where: { organisationId: org.id } });
    await prisma.planField.deleteMany({ where: { organisationId: org.id } });
    await prisma.$executeRaw`DELETE FROM "OutboxMessage" WHERE "payload"->>'organisationId' = ${org.id}`;
    await prisma.auditEvent.deleteMany({ where: { organisationId: { in: [org.id, other.id] } } });
    await removePaymentsOrg(org.id, staff.map((person) => person.id));
    await prisma.organisation.delete({ where: { id: other.id } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

describe.sequential("member history, audit detail and cache freshness", () => {
  it("logs which answers changed (keys only), by whom, and which core fields (names only)", async () => {
    signIn(0);
    const profile = { name: "History Renamed", email: `hist-${suffix}@example.test`, fieldValues: { shirt: "Secret-XL" } };
    expect(await updateMember({ organisationSlug: org.slug, memberId, profile })).toMatchObject({ ok: true });
    const answers = await prisma.auditEvent.findFirstOrThrow({ where: { organisationId: org.id, action: "MEMBER_ANSWERS_CHANGED" } });
    expect(answers.metadata).toEqual({ keys: "shirt", by: "staff", memberId });
    const updated = await prisma.auditEvent.findFirstOrThrow({ where: { organisationId: org.id, action: "MEMBER_UPDATED" } });
    expect(updated.metadata).toEqual({ fields: "name", memberId });
    expect(JSON.stringify([answers.metadata, updated.metadata])).not.toMatch(/Secret|Renamed/);
    // Saving the same answers again changes nothing, so writes no answers event.
    await updateMember({ organisationSlug: org.slug, memberId, profile });
    expect(await prisma.auditEvent.count({ where: { organisationId: org.id, action: "MEMBER_ANSWERS_CHANGED" } })).toBe(1);
  });

  it("invalidates the public page and analytics only after the change has committed, and ends the card on revoke", async () => {
    signIn(0);
    seen.calls.length = 0;
    const card = await prisma.memberCard.findFirstOrThrow({ where: { memberId, revokedAt: null } });
    const result = await decideMemberships({ organisationSlug: org.slug, termIds: [termId], action: "revoke", reason: "Breach of rules" });
    expect(result).toMatchObject({ ok: true, data: { done: 1 } });
    expect(seen.calls.length).toBeGreaterThan(0);
    expect(seen.calls.at(-1)).toMatchObject({ organisationId: org.id, scopes: ["public-page", "analytics"], termStatus: "REVOKED" });

    // The term audit carries the member, plan and reason; the live card ended with MEMBERSHIP_ENDED.
    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { organisationId: org.id, action: "MEMBERSHIP_REVOKE" } });
    expect(audit.metadata).toEqual({ memberId, planId, reason: "Breach of rules" });
    expect(await prisma.memberCard.findUniqueOrThrow({ where: { id: card.id } })).toMatchObject({ revokedReason: "MEMBERSHIP_ENDED" });
    expect(await prisma.memberCard.count({ where: { memberId, revokedAt: null } })).toBe(0);

    // Reinstating brings the plan's card back with the same number.
    await decideMemberships({ organisationSlug: org.slug, termIds: [termId], action: "reinstate" });
    const live = await prisma.memberCard.findFirstOrThrow({ where: { memberId, revokedAt: null } });
    expect(live.cardNumber).toBe(card.cardNumber);
  });

  it("shows messages and activity only to staff with the right permissions, and only this organisation's rows", async () => {
    const otherMember = await prisma.member.create({ data: { organisationId: other.id, email: `o-${suffix}@example.test`, name: "Elsewhere", memberNumber: 1 } });
    await prisma.memberMessageLog.createMany({
      data: [
        { organisationId: org.id, memberId, kind: "membership-revoked", dedupeKey: `k1-${suffix}`, status: "SENT", channel: "EMAIL", deliveryState: "sent" },
        { organisationId: other.id, memberId: otherMember.id, kind: "lapsed", dedupeKey: `k2-${suffix}`, status: "SENT", channel: "EMAIL" },
      ],
    });
    await prisma.auditEvent.create({ data: { action: "MEMBER_UPDATED", organisationId: other.id, targetType: "Member", targetId: otherMember.id, metadata: { memberId: otherMember.id } } });

    const owner = (await getMembership(staff[0].id, org.id))!;
    const full = await loadMemberHistory({ organisationId: org.id, membership: owner, scope: await teamScope(org.id, owner), memberId });
    expect(full.messages).toHaveLength(1);
    expect(full.messages![0]).toMatchObject({ kind: "Membership revoked", channel: "Email", status: "Sent" });
    expect(full.activity!.length).toBeGreaterThan(0);

    // The same member id read through another organisation finds nothing of this one.
    const wrong = await loadMemberHistory({ organisationId: other.id, membership: owner, scope: await teamScope(other.id, owner), memberId });
    expect(wrong.messages).toEqual([]);
    expect(wrong.activity).toEqual([]);

    // A viewer holds neither members.contact nor audit.view: nothing is read.
    const viewer = (await getMembership(staff[1].id, org.id))!;
    expect(await loadMemberHistory({ organisationId: org.id, membership: viewer, scope: await teamScope(org.id, viewer), memberId })).toEqual({ messages: null, activity: null });
  });

  it("carries the member on money audits", async () => {
    const { recordOfflinePayment } = await import("@/lib/payments/offline");
    const priced = await prisma.membershipPlan.create({ data: { organisationId: org.id, name: "Paid", slug: `paid-${suffix}`, currency: "INR", priceNewMinor: 50_000, priceRenewalMinor: 50_000, joinMode: "OPEN" } });
    const term = await prisma.$transaction(async (tx) => {
      const member = await upsertMember(tx, org.id, { email: `pay-${suffix}@example.test`, name: "Payer", source: "MANUAL" });
      return openTerm(tx, { org, plan: priced, memberId: member.id, byManager: true, actorUserId: staff[0].id });
    });
    const { payment } = await prisma.$transaction((tx) => recordOfflinePayment(tx, { org, termId: term.id, method: "cash", actorUserId: staff[0].id }));
    const events = await prisma.auditEvent.findMany({ where: { organisationId: org.id, targetType: "Payment", targetId: payment.id } });
    expect(events.map((event) => event.action).sort()).toEqual(["PAYMENT_PAID", "PAYMENT_RECORDED"]);
    for (const event of events) expect(event.metadata).toMatchObject({ memberId: term.memberId });
  });
});
