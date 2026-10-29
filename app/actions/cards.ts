"use server";

import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { enqueueOutbox } from "@/lib/outbox";
import { orgActionAccess } from "@/lib/permissions";
import { teamScope, unitInScope, type TeamScope } from "@/lib/membership/scope";
import { CardError, issueCard, reissueCard, revokeCard } from "@/lib/cards/issue";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const id = z.string().trim().min(1).max(64);
const EMAIL_COOLDOWN_MS = 10 * 60_000;

async function access(slug: unknown) {
  const result = await orgActionAccess(slug, "cards.manage");
  if (!result.ok) return result;
  if (await isActionRateLimited("action", result.userId)) return { ok: false as const, error: "Too many requests. Try again shortly." };
  return { ...result, scope: await teamScope(result.organisation.id, result.membership.unitId) };
}

/** The member, in this organisation and inside the manager's unit scope, or null. */
async function scopedMember(scope: TeamScope, memberId: string) {
  const member = await prisma.member.findFirst({ where: { id: memberId, organisationId: scope.organisationId, anonymisedAt: null }, select: { id: true, unit: { select: { path: true } } } });
  return member && unitInScope(scope, member.unit?.path ?? null) ? member : null;
}

async function scopedCard(scope: TeamScope, cardId: string) {
  const card = await prisma.memberCard.findFirst({ where: { id: cardId, organisationId: scope.organisationId }, select: { id: true, memberId: true, planId: true, revokedAt: true, lastEmailedAt: true } });
  return card && (await scopedMember(scope, card.memberId)) ? card : null;
}

function refresh(slug: string, memberId: string) {
  revalidatePath(`/dashboard/${slug}/members/${memberId}`);
}

function failure(error: unknown): { ok: false; error: string } {
  if (error instanceof CardError) return { ok: false, error: error.message };
  throw error;
}

const issueSchema = z.object({ organisationSlug: z.string().trim().min(1), memberId: id, planId: id });

/** Issue a card on a plan the member holds or held (for members from before cards, or after a revoke). */
export async function issueMemberCard(input: unknown): Promise<ActionResult<{ cardId: string }>> {
  const parsed = issueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const member = await scopedMember(ctx.scope, parsed.data.memberId);
  if (!member) return { ok: false, error: "Member not found." };
  const started = await prisma.membershipTerm.count({ where: { organisationId: ctx.organisation.id, memberId: member.id, planId: parsed.data.planId, startsAt: { not: null } } });
  if (!started) return { ok: false, error: "Cards are issued once a membership on this plan has started." };
  try {
    const { card } = await prisma.$transaction((tx) => issueCard(tx, { organisationId: ctx.organisation.id, memberId: member.id, planId: parsed.data.planId }, ctx.userId));
    refresh(ctx.organisation.slug, member.id);
    return { ok: true, data: { cardId: card.id } };
  } catch (error) {
    return failure(error);
  }
}

const cardSchema = z.object({ organisationSlug: z.string().trim().min(1), cardId: id });

/** A new card (new QR) for the same member and plan; the old one shows as replaced. */
export async function reissueMemberCard(input: unknown): Promise<ActionResult<{ cardId: string }>> {
  const parsed = cardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const card = await scopedCard(ctx.scope, parsed.data.cardId);
  if (!card) return { ok: false, error: "Card not found." };
  try {
    const fresh = await prisma.$transaction((tx) => reissueCard(tx, { organisationId: ctx.organisation.id, memberId: card.memberId, planId: card.planId }, ctx.userId));
    refresh(ctx.organisation.slug, card.memberId);
    return { ok: true, data: { cardId: fresh.id } };
  } catch (error) {
    return failure(error);
  }
}

export async function revokeMemberCard(input: unknown): Promise<ActionResult> {
  const parsed = cardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const card = await scopedCard(ctx.scope, parsed.data.cardId);
  if (!card) return { ok: false, error: "Card not found." };
  try {
    await prisma.$transaction((tx) => revokeCard(tx, { organisationId: ctx.organisation.id, cardId: card.id, actorUserId: ctx.userId }));
    refresh(ctx.organisation.slug, card.memberId);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/** Queue the card as a PDF email to the member. One per card every ten minutes. */
export async function emailMemberCard(input: unknown): Promise<ActionResult> {
  const parsed = cardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const card = await scopedCard(ctx.scope, parsed.data.cardId);
  if (!card || card.revokedAt) return { ok: false, error: "Card not found." };
  const now = new Date();
  const queued = await prisma.$transaction(async (tx) => {
    const { count } = await tx.memberCard.updateMany({
      where: { id: card.id, OR: [{ lastEmailedAt: null }, { lastEmailedAt: { lt: new Date(now.getTime() - EMAIL_COOLDOWN_MS) } }] },
      data: { lastEmailedAt: now },
    });
    if (count === 0) return false;
    await enqueueOutbox(tx, "member-card", { cardId: card.id, organisationId: ctx.organisation.id });
    await recordAuditEvent({ action: "CARD_EMAILED", actorUserId: ctx.userId, organisationId: ctx.organisation.id, targetType: "MemberCard", targetId: card.id, client: tx });
    return true;
  });
  if (!queued) return { ok: false, error: "This card was emailed a few minutes ago. Try again later." };
  refresh(ctx.organisation.slug, card.memberId);
  return { ok: true };
}
