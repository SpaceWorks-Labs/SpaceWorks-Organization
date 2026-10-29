import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ current: { id: "", email: "" } }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.current.id ? { user: identity.current } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { upsertMember } from "@/lib/membership/service";
import { loadWallet } from "@/lib/portal/wallet";
import { ERASED_NAME, erasedEmail } from "@/lib/portal/erasure";
import { leaveMembership, renewMembership, requestDataErasure, updateMemberProfile, withdrawConsent, withdrawTerm } from "@/app/actions/portal";
import { decideErasureRequest } from "@/app/actions/erasure";
import { publishPublicPage, savePublicPageDraft } from "@/app/actions/public-page";
import { loadPublicOrgPage } from "@/lib/views/app__o__orgSlug__page";
import { newSection } from "@/lib/publicPage/sections";
import { addStaff } from "../helpers/staff";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const DAY = 86_400_000;
const people: Record<string, { id: string; email: string }> = {};
const orgs: Record<string, { id: string; slug: string }> = {};
const plans: Record<string, string> = {};
const signIn = (key: string) => {
  identity.current = people[key];
};

/** A live term ending in `days`, with 15 days of grace, as if it was paid a while ago. */
async function liveTerm(orgKey: string, memberId: string, days: number) {
  const now = Date.now();
  return prisma.membershipTerm.create({
    data: {
      organisationId: orgs[orgKey].id, memberId, planId: plans[orgKey], status: "ACTIVE", currency: "INR", priceMinor: 100_000,
      startsAt: new Date(now - 300 * DAY), endsAt: new Date(now + days * DAY), graceUntil: new Date(now + (days + 15) * DAY),
    },
  });
}

beforeAll(async () => {
  for (const key of ["shaan", "abhiram", "owner", "unverified"]) {
    const user = await prisma.user.create({ data: { email: `${key}-${suffix}@example.test`, emailVerified: key === "unverified" ? null : new Date(), name: key, mfaEnabledAt: new Date() } });
    people[key] = { id: user.id, email: user.email! };
  }
  for (const key of ["spaceworks", "tinkerspace"]) {
    const org = await prisma.organisation.create({ data: { name: key, slug: `${key}-${suffix}`, status: "ACTIVE" } });
    orgs[key] = { id: org.id, slug: org.slug };
    const plan = await prisma.membershipPlan.create({ data: { organisationId: org.id, name: "Annual", slug: "annual", joinMode: "OPEN", priceNewMinor: 120_000, priceRenewalMinor: 100_000, renewalWindowDays: 30 } });
    plans[key] = plan.id;
    await prisma.planField.create({ data: { organisationId: org.id, planId: plan.id, key: "profession", label: "Profession", type: "TEXT" } });
    await prisma.planField.create({ data: { organisationId: org.id, planId: plan.id, key: "score", label: "Interview score", type: "TEXT", adminOnly: true } });
  }
  await addStaff(orgs.spaceworks.id, people.owner.id, "OWNER");
  await addStaff(orgs.tinkerspace.id, people.owner.id, "OWNER");

  for (const [orgKey, personKey, days] of [["spaceworks", "shaan", 10], ["tinkerspace", "shaan", 200], ["spaceworks", "abhiram", 10]] as const) {
    const member = await prisma.$transaction((tx) => upsertMember(tx, orgs[orgKey].id, { email: people[personKey].email.toUpperCase(), name: personKey, source: "JOIN_FORM", fieldValues: { profession: "Engineer", score: "9/10" } }));
    await prisma.consentRecord.create({ data: { organisationId: orgs[orgKey].id, memberId: member.id, purpose: "membership", noticeVersion: "2026-10" } });
    await liveTerm(orgKey, member.id, days);
  }
});

afterAll(async () => {
  for (const org of Object.values(orgs)) {
    await prisma.$executeRaw`DELETE FROM "OutboxMessage" WHERE "payload"->>'organisationId' = ${org.id}`;
    await prisma.organisation.delete({ where: { id: org.id } }).catch(() => undefined);
  }
  await prisma.user.deleteMany({ where: { id: { in: Object.values(people).map((person) => person.id) } } });
  await prisma.$disconnect();
});

const memberOf = (orgKey: string, personKey: string) => prisma.member.findFirstOrThrow({ where: { organisationId: orgs[orgKey].id, email: people[personKey].email } });

describe.sequential("member portal", () => {
  it("shows a person only their own memberships, across organisations, by verified email", async () => {
    const wallet = await loadWallet(people.shaan.id);
    expect(wallet?.map((entry) => entry.organisation.slug).sort()).toEqual([orgs.spaceworks.slug, orgs.tinkerspace.slug].sort());
    expect(wallet?.every((entry) => entry.name === "shaan")).toBe(true);
    expect(wallet?.find((entry) => entry.organisation.slug === orgs.spaceworks.slug)?.memberships[0].state.actions.renew).toBe(true);
    expect(wallet?.find((entry) => entry.organisation.slug === orgs.tinkerspace.slug)?.memberships[0].state.actions.renew).toBe(false);
    // The record is claimed by the account on first sight.
    expect((await memberOf("spaceworks", "shaan")).userId).toBe(people.shaan.id);
    expect(await loadWallet(people.unverified.id)).toBeNull();
    expect(await loadWallet(people.owner.id)).toEqual([]);
  });

  it("renews into an unpaid renewal term, and refuses before the window opens", async () => {
    signIn("shaan");
    const renewed = await renewMembership({ organisationSlug: orgs.spaceworks.slug, planId: plans.spaceworks });
    expect(renewed).toMatchObject({ ok: true, data: { status: "PENDING_PAYMENT" } });
    const term = await prisma.membershipTerm.findUniqueOrThrow({ where: { id: (renewed as { data: { termId: string } }).data.termId } });
    expect(term).toMatchObject({ kind: "RENEWAL", status: "PENDING_PAYMENT", priceMinor: 100_000 });
    expect(await prisma.outboxMessage.count({ where: { kind: "membership-notice", payload: { path: ["termId"], equals: term.id } } })).toBe(1);
    expect(await renewMembership({ organisationSlug: orgs.tinkerspace.slug, planId: plans.tinkerspace })).toMatchObject({ ok: false });
    const wallet = await loadWallet(people.shaan.id);
    expect(wallet?.find((entry) => entry.organisation.slug === orgs.spaceworks.slug)?.memberships[0].state.actions.payTermId).toBe(term.id);
  });

  it("never lets one member act on another member's terms", async () => {
    const shaan = await memberOf("spaceworks", "shaan");
    const pending = await prisma.membershipTerm.findFirstOrThrow({ where: { memberId: shaan.id, status: "PENDING_PAYMENT" } });
    signIn("abhiram");
    expect(await withdrawTerm({ organisationSlug: orgs.spaceworks.slug, termId: pending.id })).toMatchObject({ ok: false });
    signIn("owner");
    expect(await withdrawTerm({ organisationSlug: orgs.spaceworks.slug, termId: pending.id })).toMatchObject({ ok: false, error: "We couldn't find that membership on your account." });
    signIn("shaan");
    expect(await withdrawTerm({ organisationSlug: orgs.spaceworks.slug, termId: pending.id })).toEqual({ ok: true });
    expect((await prisma.membershipTerm.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("CANCELLED");
  });

  it("edits the member's own details but keeps admin-only answers, and withdraws consent", async () => {
    signIn("shaan");
    const result = await updateMemberProfile({ organisationSlug: orgs.spaceworks.slug, profile: { name: "Shaan Shoukath", phone: "+91 90000 00000", stateCode: "KL", fieldValues: { profession: "Systems Engineer", score: "10/10" } } });
    expect(result).toEqual({ ok: true });
    const member = await memberOf("spaceworks", "shaan");
    expect(member).toMatchObject({ name: "Shaan Shoukath", phone: "+91 90000 00000", stateCode: "KL", fieldValues: { profession: "Systems Engineer", score: "9/10" } });
    const consent = await prisma.consentRecord.findFirstOrThrow({ where: { memberId: member.id } });
    expect(await withdrawConsent({ organisationSlug: orgs.spaceworks.slug, consentId: consent.id })).toEqual({ ok: true });
    expect(await withdrawConsent({ organisationSlug: orgs.spaceworks.slug, consentId: consent.id })).toMatchObject({ ok: false });
  });

  it("leaves a membership: the term ends, nothing is deleted, and the member is emailed", async () => {
    signIn("shaan");
    const member = await memberOf("tinkerspace", "shaan");
    expect(await leaveMembership({ organisationSlug: orgs.tinkerspace.slug, planId: plans.tinkerspace })).toEqual({ ok: true });
    const terms = await prisma.membershipTerm.findMany({ where: { memberId: member.id } });
    expect(terms.map((term) => term.status)).toEqual(["CANCELLED"]);
    expect(await prisma.outboxMessage.count({ where: { kind: "membership-notice", payload: { path: ["notice"], equals: "left" } } })).toBeGreaterThanOrEqual(1);
  });

  it("takes an erasure request to a manager, whose approval anonymises the member and keeps the history", async () => {
    signIn("abhiram");
    expect(await requestDataErasure({ organisationSlug: orgs.spaceworks.slug, reason: "Moving away" })).toEqual({ ok: true });
    expect(await requestDataErasure({ organisationSlug: orgs.spaceworks.slug })).toMatchObject({ ok: false });
    const member = await memberOf("spaceworks", "abhiram");
    const request = await prisma.erasureRequest.findFirstOrThrow({ where: { memberId: member.id } });
    expect(request).toMatchObject({ status: "PENDING", requestedByUserId: people.abhiram.id });

    // Members can't decide their own request; the manager can.
    expect(await decideErasureRequest({ organisationSlug: orgs.spaceworks.slug, requestId: request.id, decision: "approve" })).toMatchObject({ ok: false });
    signIn("owner");
    expect(await decideErasureRequest({ organisationSlug: orgs.tinkerspace.slug, requestId: request.id, decision: "approve" })).toMatchObject({ ok: false, error: "Request not found." });
    expect(await decideErasureRequest({ organisationSlug: orgs.spaceworks.slug, requestId: request.id, decision: "approve" })).toEqual({ ok: true });

    const erased = await prisma.member.findUniqueOrThrow({ where: { id: member.id }, include: { terms: true, consents: true } });
    expect(erased).toMatchObject({ name: ERASED_NAME, email: erasedEmail(member.id), phone: null, userId: null, fieldValues: {}, memberNumber: member.memberNumber });
    expect(erased.anonymisedAt).not.toBeNull();
    expect(erased.terms).toHaveLength(1);
    expect(erased.terms[0].status).toBe("CANCELLED");
    expect(erased.consents.every((consent) => consent.withdrawnAt !== null)).toBe(true);
    expect((await prisma.erasureRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("APPROVED");
    expect(await prisma.outboxMessage.count({ where: { kind: "erasure-notice", payload: { path: ["requestId"], equals: request.id } } })).toBe(2);
    signIn("abhiram");
    expect(await loadWallet(people.abhiram.id)).toEqual([]);
  });

  it("publishes a draft to the public page; later drafts stay unpublished", async () => {
    signIn("owner");
    const slug = orgs.spaceworks.slug;
    const about = { ...newSection("about", "aboutsec01"), markdown: "## Who we are\nMakers of **Kochi**." };
    const document = { tagline: "Makers of Kochi", coverAssetKey: null, accentColor: "#FF7447", sections: [about, newSection("plans", "planssec01")] };
    expect(await savePublicPageDraft({ organisationSlug: slug, document })).toEqual({ ok: true });
    expect((await loadPublicOrgPage({ params: Promise.resolve({ orgSlug: slug }) })).page).toBeNull();

    expect(await publishPublicPage({ organisationSlug: slug, document })).toEqual({ ok: true });
    const live = await loadPublicOrgPage({ params: Promise.resolve({ orgSlug: slug }) });
    expect(live.page).toMatchObject({ tagline: "Makers of Kochi", accentColor: "#FF7447" });
    expect(live.page?.sections.map((section) => section.type)).toEqual(["about", "plans"]);
    expect(live.plans).toHaveLength(1);

    expect(await savePublicPageDraft({ organisationSlug: slug, document: { ...document, tagline: "Draft only" } })).toEqual({ ok: true });
    expect((await loadPublicOrgPage({ params: Promise.resolve({ orgSlug: slug }) })).page?.tagline).toBe("Makers of Kochi");

    const foreign = { ...newSection("gallery", "gallery001"), images: [{ key: `organisations/${orgs.tinkerspace.id}/page-images/3f2b8c1e-1d2a-4c3b-9a8b-7c6d5e4f3a2b.webp`, alt: "" }] };
    expect(await publishPublicPage({ organisationSlug: slug, document: { ...document, sections: [foreign] } })).toMatchObject({ ok: false });
    signIn("shaan");
    expect(await publishPublicPage({ organisationSlug: slug, document })).toMatchObject({ ok: false });
  });
});
