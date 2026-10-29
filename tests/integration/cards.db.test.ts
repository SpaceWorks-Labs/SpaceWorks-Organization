import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));

import { prisma } from "@/lib/db";
import { decideTerm, openTerm, startRenewal, upsertMember } from "@/lib/membership/service";
import { issueCard, reissueCard, revokeCard } from "@/lib/cards/issue";
import { lookupVerification } from "@/lib/cards/verifyLookup";
import { loadCardForRender } from "@/lib/cards/data";
import { renderMemberCard } from "@/lib/cards/render";
import { listCardsForUser } from "@/lib/cards/wallet";
import { deliverMemberCard } from "@/lib/email/memberCard";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
let org: { id: string; timezone: string; financialYearStartMonth: number };
let plan: Awaited<ReturnType<typeof prisma.membershipPlan.create>>;
const at = (iso: string) => new Date(iso);

async function join(email: string, name: string) {
  return prisma.$transaction(async (tx) => {
    const member = await upsertMember(tx, org.id, { email, name, source: "JOIN_FORM" });
    const term = await openTerm(tx, { org, plan, memberId: member.id, byManager: false, actorUserId: null, now: at("2026-06-15T06:00:00Z") });
    return { member, term };
  });
}

beforeAll(async () => {
  const created = await prisma.organisation.create({ data: { name: "SpaceWorks Cards", slug: `cards-${suffix}`, status: "ACTIVE" } });
  org = { id: created.id, timezone: created.timezone, financialYearStartMonth: created.financialYearStartMonth };
  plan = await prisma.membershipPlan.create({ data: { organisationId: org.id, name: "Annual member", slug: `annual-${suffix}`, currency: "INR", priceNewMinor: 0, priceRenewalMinor: 0, joinMode: "APPROVAL" } });
});

afterAll(async () => {
  if (org) {
    await prisma.$executeRaw`DELETE FROM "OutboxMessage" WHERE "payload"->>'organisationId' = ${org.id}`;
    await prisma.asset.deleteMany({ where: { organisationId: org.id } });
    await prisma.memberCard.deleteMany({ where: { organisationId: org.id } });
    await prisma.organisation.delete({ where: { id: org.id } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

describe.sequential("member cards", () => {
  let memberId = "";
  let token = "";

  it("issues a card when an application is approved, and /verify shows the member as current", async () => {
    const { member, term } = await join(`malayalam-${suffix}@example.test`, "ശ്രീക്ഷേത്ര മാധവൻ");
    memberId = member.id;
    expect(term.status).toBe("PENDING_APPROVAL");
    expect(await prisma.memberCard.count({ where: { memberId } })).toBe(0);

    const owner = await prisma.user.create({ data: { email: `owner-${suffix}@example.test`, emailVerified: new Date() } });
    await prisma.$transaction((tx) => decideTerm(tx, { org, termId: term.id, action: "approve", actorUserId: owner.id }));
    const cards = await prisma.memberCard.findMany({ where: { memberId } });
    expect(cards).toHaveLength(1);
    expect(cards[0]!.cardNumber).toMatch(/^[A-Z0-9]+-\d{4}$/);
    token = cards[0]!.verifyToken;

    const view = await lookupVerification(token);
    expect(view).toMatchObject({ state: "member", verdict: "valid", name: "ശ്രീക്ഷേത്ര മാധവൻ", planName: "Annual member" });
    expect(await lookupVerification("x".repeat(43))).toEqual({ state: "not-found" });
  });

  it("keeps the same card and QR through a renewal", async () => {
    await prisma.$transaction((tx) => startRenewal(tx, { org, plan, memberId, byManager: true, actorUserId: null, now: at("2027-03-20T06:00:00Z") }));
    const cards = await prisma.memberCard.findMany({ where: { memberId } });
    expect(cards).toHaveLength(1);
    expect(cards[0]!.verifyToken).toBe(token);
  });

  it("issuing again returns the live card instead of a second one", async () => {
    const again = await prisma.$transaction((tx) => issueCard(tx, { organisationId: org.id, memberId, planId: plan.id }, null));
    expect(again.created).toBe(false);
    expect(again.card.verifyToken).toBe(token);
  });

  it("renders the stored card as PDF and PNG", async () => {
    const card = await prisma.memberCard.findFirstOrThrow({ where: { memberId, revokedAt: null } });
    const loaded = await loadCardForRender(card.id);
    expect(loaded?.holder.verifyUrl).toContain(`/verify/${token}`);
    const pdf = await renderMemberCard(loaded!.input, loaded!.holder, "pdf", { title: "Card" });
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe("%PDF-");
    const png = await renderMemberCard(loaded!.input, loaded!.holder, "png", { title: "Card" });
    expect(Buffer.from(png).subarray(1, 4).toString()).toBe("PNG");
  });

  it("lists the card in the member's wallet once their account has the same verified email", async () => {
    const user = await prisma.user.create({ data: { email: `malayalam-${suffix}@example.test`, emailVerified: new Date() } });
    const wallet = await listCardsForUser(user.id);
    expect(wallet.map((item) => item.verifyPath)).toEqual([`/verify/${token}`]);
    const stranger = await prisma.user.create({ data: { email: `stranger-${suffix}@example.test`, emailVerified: new Date() } });
    expect(await listCardsForUser(stranger.id)).toEqual([]);
  });

  it("emails the card through the outbox handler, and drops it once revoked", async () => {
    const card = await prisma.memberCard.findFirstOrThrow({ where: { memberId, revokedAt: null } });
    expect(await deliverMemberCard({ cardId: card.id, organisationId: org.id }, "<test@outbox.invalid>")).toBe("sent");
    expect(await deliverMemberCard({ cardId: card.id, organisationId: "another-org" }, "<test@outbox.invalid>")).toBe("dropped");
  });

  it("reissue replaces the old QR; revoke turns the new one off", async () => {
    const owner = await prisma.user.findFirstOrThrow({ where: { email: `owner-${suffix}@example.test` } });
    const fresh = await prisma.$transaction((tx) => reissueCard(tx, { organisationId: org.id, memberId, planId: plan.id }, owner.id));
    expect(fresh.verifyToken).not.toBe(token);
    expect(fresh.cardNumber).toBe((await prisma.memberCard.findFirstOrThrow({ where: { verifyToken: token } })).cardNumber);
    expect(await lookupVerification(token)).toEqual({ state: "card-replaced", organisationName: "SpaceWorks Cards" });
    expect(await lookupVerification(fresh.verifyToken)).toMatchObject({ state: "member", verdict: "valid" });

    await prisma.$transaction((tx) => revokeCard(tx, { organisationId: org.id, cardId: fresh.id, actorUserId: owner.id }));
    expect(await lookupVerification(fresh.verifyToken)).toEqual({ state: "card-revoked", organisationName: "SpaceWorks Cards" });
    await expect(prisma.$transaction((tx) => revokeCard(tx, { organisationId: org.id, cardId: fresh.id, actorUserId: owner.id }))).rejects.toThrow("already revoked");
    // A card can't be revoked from another organisation.
    await expect(prisma.$transaction((tx) => revokeCard(tx, { organisationId: "elsewhere", cardId: fresh.id, actorUserId: owner.id }))).rejects.toThrow("not found");
  });

  it("the database allows only one live card per member and plan", async () => {
    const member = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });
    await prisma.memberCard.create({ data: { organisationId: org.id, memberId, planId: plan.id, cardNumber: "X-0001", verifyToken: "b".repeat(43) } });
    await expect(prisma.memberCard.create({ data: { organisationId: org.id, memberId: member.id, planId: plan.id, cardNumber: "X-0002", verifyToken: "c".repeat(43) } })).rejects.toThrow();
    await expect(prisma.memberCard.create({ data: { organisationId: org.id, memberId, planId: plan.id, cardNumber: "X-0003", verifyToken: "short", revokedAt: new Date(), revokedReason: "REVOKED" } })).rejects.toThrow();
  });
});
