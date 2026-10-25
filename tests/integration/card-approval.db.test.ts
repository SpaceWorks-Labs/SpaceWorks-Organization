import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decideTerm, openTerm, upsertMember } from "@/lib/membership/service";
import { approveCardDraft } from "@/lib/cards/approval";
import { designFor, loadCardOrgContext } from "@/lib/cards/data";
import { defaultCardDesign } from "@/lib/cards/design/presets";
import { draftDiffers, readDraft } from "@/lib/cards/draft";

/*
 * Card designs are per organisation. Managers' drafts never reach cards until the owner approves them;
 * a member role gets its own design and numbers only once approved; and nothing one organisation sets
 * up (designs, roles, numbering) ever applies to another's cards.
 */

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
type Org = { id: string; timezone: string; financialYearStartMonth: number; planId: string; roleId: string; name: string };
const orgs: Org[] = [];
let ownerId = "";
const json = (value: unknown) => value as Prisma.InputJsonValue;

async function createOrg(name: string, slug: string): Promise<Org> {
  const created = await prisma.organisation.create({ data: { name, slug: `${slug}-${suffix}`, status: "ACTIVE" } });
  const plan = await prisma.membershipPlan.create({ data: { organisationId: created.id, name: "Annual member", slug: `annual-${suffix}`, currency: "INR", priceNewMinor: 0, priceRenewalMinor: 0, joinMode: "APPROVAL" } });
  const role = await prisma.memberRole.create({ data: { organisationId: created.id, name: "Secretary" } });
  return { id: created.id, timezone: created.timezone, financialYearStartMonth: created.financialYearStartMonth, planId: plan.id, roleId: role.id, name };
}

async function join(org: Org, email: string, roleId?: string) {
  const plan = await prisma.membershipPlan.findUniqueOrThrow({ where: { id: org.planId } });
  const { member, term } = await prisma.$transaction(async (tx) => {
    const member = await upsertMember(tx, org.id, { email, name: "Priya Raman", source: "JOIN_FORM" });
    if (roleId) await tx.memberRoleAssignment.create({ data: { organisationId: org.id, memberId: member.id, roleId, isPrimary: true } });
    return { member, term: await openTerm(tx, { org, plan, memberId: member.id, byManager: false, actorUserId: null }) };
  });
  await prisma.$transaction((tx) => decideTerm(tx, { org, termId: term.id, action: "approve", actorUserId: ownerId }));
  return (await prisma.memberCard.findFirstOrThrow({ where: { memberId: member.id } })).cardNumber;
}

const context = (org: Org) => ({ organisationName: org.name, planName: "" });

beforeAll(async () => {
  ownerId = (await prisma.user.create({ data: { email: `approval-owner-${suffix}@example.test`, emailVerified: new Date() } })).id;
  orgs.push(await createOrg("Alpha Makers", "alpha"), await createOrg("Beta Guild", "beta"));
});

afterAll(async () => {
  for (const org of orgs) {
    await prisma.$executeRaw`DELETE FROM "OutboxMessage" WHERE "payload"->>'organisationId' = ${org.id}`;
    await prisma.memberCard.deleteMany({ where: { organisationId: org.id } });
    await prisma.organisation.delete({ where: { id: org.id } }).catch(() => undefined);
  }
  if (ownerId) await prisma.user.delete({ where: { id: ownerId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe.sequential("card design approval", () => {
  it("each organisation has its own base design", async () => {
    const [alpha, beta] = orgs as [Org, Org];
    await prisma.cardDesign.create({ data: { organisationId: alpha.id, design: json(defaultCardDesign(context(alpha), "night")), numberPrefix: "ALP", approvedAt: new Date() } });
    await prisma.cardDesign.create({ data: { organisationId: beta.id, design: json(defaultCardDesign(context(beta), "student")), numberPrefix: "BET", approvedAt: new Date() } });
    const plan = { id: "x", name: "Plan" };
    expect(designFor((await loadCardOrgContext(alpha.id))!, plan).design.preset).toBe("night");
    expect(designFor((await loadCardOrgContext(beta.id))!, plan).design.preset).toBe("student");
    expect(await join(alpha, `a1-${suffix}@example.test`)).toBe("ALP-0001");
    expect(await join(beta, `b1-${suffix}@example.test`)).toBe("BET-0001");
  });

  it("keeps a manager's draft off members' cards until the owner approves it", async () => {
    const [alpha] = orgs as [Org];
    const row = await prisma.cardDesign.findFirstOrThrow({ where: { organisationId: alpha.id, planId: null, roleId: null } });
    await prisma.cardDesign.update({ where: { id: row.id }, data: { draft: json({ design: defaultCardDesign(context(alpha), "corporate"), numberPrefix: "ALX", numberFormat: "{PREFIX}/{SEQ:3}", watermarkUrl: null }), draftUpdatedAt: new Date() } });
    const stored = await prisma.cardDesign.findUniqueOrThrow({ where: { id: row.id } });
    expect(readDraft(stored, context(alpha)).design.preset).toBe("corporate");
    expect(draftDiffers(stored, context(alpha))).toBe(true);
    // Cards and numbering still follow the approved design.
    expect(designFor((await loadCardOrgContext(alpha.id))!, { id: "x", name: "Plan" }).design.preset).toBe("night");
    expect(await join(alpha, `a2-${suffix}@example.test`)).toBe("ALP-0002");

    expect(await prisma.$transaction((tx) => approveCardDraft(tx, { organisationId: alpha.id, rowId: row.id, actorUserId: ownerId, context: context(alpha) }))).toBe(true);
    const approved = await prisma.cardDesign.findUniqueOrThrow({ where: { id: row.id } });
    expect(approved).toMatchObject({ draft: null, numberPrefix: "ALX", numberFormat: "{PREFIX}/{SEQ:3}", approvedById: ownerId });
    expect(designFor((await loadCardOrgContext(alpha.id))!, { id: "x", name: "Plan" }).design.preset).toBe("corporate");
    expect(await join(alpha, `a3-${suffix}@example.test`)).toBe("ALX/003");
    // Nothing left to approve.
    expect(await prisma.$transaction((tx) => approveCardDraft(tx, { organisationId: alpha.id, rowId: row.id, actorUserId: ownerId, context: context(alpha) }))).toBe(false);
  });

  it("gives a member role its own design and numbers only once approved", async () => {
    const [alpha] = orgs as [Org];
    const draftOnly = await prisma.cardDesign.create({
      data: { organisationId: alpha.id, roleId: alpha.roleId, draft: json({ design: defaultCardDesign(context(alpha), "community"), numberPrefix: "SEC", numberFormat: "{PREFIX}-{SEQ:2}", watermarkUrl: null }), numberPrefix: "SEC" },
    });
    let ctx = (await loadCardOrgContext(alpha.id))!;
    expect(designFor(ctx, { id: "x", name: "Plan" }, alpha.roleId).source).toBe("organisation");
    expect(await join(alpha, `a4-${suffix}@example.test`, alpha.roleId)).toBe("ALX/004");

    await prisma.$transaction((tx) => approveCardDraft(tx, { organisationId: alpha.id, rowId: draftOnly.id, actorUserId: ownerId, context: context(alpha) }));
    ctx = (await loadCardOrgContext(alpha.id))!;
    expect(designFor(ctx, { id: "x", name: "Plan" }, alpha.roleId)).toMatchObject({ source: "role", design: { preset: "community" } });
    expect(await join(alpha, `a5-${suffix}@example.test`, alpha.roleId)).toBe("SEC-01");
    // Members without the role keep the organisation's design and numbers.
    expect(await join(alpha, `a6-${suffix}@example.test`)).toBe("ALX/005");
  });

  it("never applies one organisation's designs, roles or numbering to another's cards", async () => {
    const [alpha, beta] = orgs as [Org, Org];
    const betaCtx = (await loadCardOrgContext(beta.id))!;
    expect(betaCtx.designs.every((row) => row.roleId !== alpha.roleId)).toBe(true);
    // Even asked for Alpha's role, Beta's cards use Beta's own design.
    expect(designFor(betaCtx, { id: "x", name: "Plan" }, alpha.roleId)).toMatchObject({ source: "organisation", design: { preset: "student" } });
    // Beta's own Secretary role has no design, so it numbers with Beta's base pattern.
    expect(await join(beta, `b2-${suffix}@example.test`, beta.roleId)).toBe("BET-0002");
    // The approval of Alpha's row can't be replayed against Beta.
    const alphaRow = await prisma.cardDesign.findFirstOrThrow({ where: { organisationId: alpha.id, roleId: alpha.roleId } });
    expect(await prisma.$transaction((tx) => approveCardDraft(tx, { organisationId: beta.id, rowId: alphaRow.id, actorUserId: ownerId, context: context(beta) }))).toBe(false);
  });

  it("the database refuses a design row with neither an approved design nor a draft", async () => {
    const [alpha] = orgs as [Org];
    await expect(prisma.cardDesign.create({ data: { organisationId: alpha.id, planId: alpha.planId, numberPrefix: "PLN" } })).rejects.toThrow();
  });
});
