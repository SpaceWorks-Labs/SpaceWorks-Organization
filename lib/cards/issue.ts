import "server-only";

import { randomBytes } from "node:crypto";
import type { MemberCard, Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { deriveCardPrefix } from "./core";
import { DEFAULT_NUMBER_FORMAT, formatCardNumberFrom, formatUsesYear, numberCounterName, yearIn } from "./numbering";

/*
 * Issuing, reissuing and revoking member cards. Every change locks the member row first, so two
 * activations (or a manager and an activation) cannot both issue; the partial unique index on live
 * cards is the final guard. A card number belongs to a membership (lib/cards/numbering.ts): reissues
 * (a lost card, a new primary role) keep it and change only the verify token, so the old QR stops
 * verifying; a new registration after a membership ended gets a new number.
 */

type Tx = Prisma.TransactionClient;
type CardRef = { organisationId: string; memberId: string; planId: string };

export class CardError extends Error {
  override name = "CardError";
}

/** 32 random bytes as base64url: 43 characters. */
export function newVerifyToken() {
  return randomBytes(32).toString("base64url");
}

async function lockMember(tx: Tx, organisationId: string, memberId: string) {
  const rows = await tx.$queryRaw<Array<{ memberNumber: number; anonymisedAt: Date | null }>>`
    SELECT "memberNumber", "anonymisedAt" FROM "Member" WHERE "id" = ${memberId} AND "organisationId" = ${organisationId} FOR UPDATE`;
  const member = rows[0];
  if (!member || member.anonymisedAt) throw new CardError("Member not found.");
  return member;
}

async function bumpCounter(tx: Tx, organisationId: string, name: string) {
  const [row] = await tx.$queryRaw<Array<{ value: number }>>`
    INSERT INTO "OrgCounter" ("organisationId", "name", "next") VALUES (${organisationId}, ${name}, 2)
    ON CONFLICT ("organisationId", "name") DO UPDATE SET "next" = "OrgCounter"."next" + 1
    RETURNING "next" - 1 AS value`;
  return Number(row!.value);
}

/**
 * A new card number: the member's primary role design numbers its own cards, else the organisation
 * default does. The counter row stays locked until the transaction ends, so concurrent issues queue;
 * a number some card already has (an older pattern, an earlier registration) is skipped.
 */
async function nextCardNumber(tx: Tx, organisationId: string, memberId: string, memberNumber: number) {
  const primary = await tx.memberRoleAssignment.findFirst({ where: { organisationId, memberId, isPrimary: true, role: { archivedAt: null } }, select: { roleId: true } });
  const select = { numberPrefix: true, numberFormat: true } as const;
  const byRole = primary ? await tx.cardDesign.findFirst({ where: { organisationId, roleId: primary.roleId }, select }) : null;
  const scheme = byRole ?? (await tx.cardDesign.findFirst({ where: { organisationId, planId: null, roleId: null }, select }));
  const org = await tx.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { name: true, timezone: true } });
  const format = scheme?.numberFormat ?? DEFAULT_NUMBER_FORMAT;
  const prefix = scheme?.numberPrefix ?? deriveCardPrefix(org.name);
  const year = yearIn(org.timezone);
  const counter = numberCounterName({ roleId: byRole ? primary!.roleId : null }, formatUsesYear(format) ? year : null);
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const number = formatCardNumberFrom(format, { prefix, seq: await bumpCounter(tx, organisationId, counter), memberNumber, year });
    if (!(await tx.memberCard.findFirst({ where: { organisationId, cardNumber: number }, select: { id: true } }))) return number;
  }
  throw new CardError("No free card number is left in this pattern. Change the card number pattern.");
}

async function createCard(tx: Tx, ref: CardRef, cardNumber: string, actorUserId: string | null) {
  return tx.memberCard.create({ data: { ...ref, cardNumber, verifyToken: newVerifyToken(), issuedById: actorUserId } });
}

function liveCard(tx: Tx, ref: CardRef) {
  return tx.memberCard.findFirst({ where: { ...ref, revokedAt: null } });
}

/**
 * Issue a card for (member, plan) unless a live one exists. Returns the live card and whether it is new.
 * A card for a membership that carries on (a reinstatement, a manager issuing one) keeps the number
 * of the plan's last card. `fresh` is a new registration: the old card ends and the new one gets a
 * new number.
 */
export async function issueCard(tx: Tx, ref: CardRef, actorUserId: string | null, options: { fresh?: boolean } = {}): Promise<{ card: MemberCard; created: boolean }> {
  const member = await lockMember(tx, ref.organisationId, ref.memberId);
  const existing = await liveCard(tx, ref);
  if (existing && !options.fresh) return { card: existing, created: false };
  if (existing) await tx.memberCard.update({ where: { id: existing.id }, data: { revokedAt: new Date(), revokedById: actorUserId, revokedReason: "MEMBERSHIP_ENDED" } });
  const previous = options.fresh ? null : await tx.memberCard.findFirst({ where: ref, orderBy: { issuedAt: "desc" }, select: { cardNumber: true } });
  const card = await createCard(tx, ref, previous?.cardNumber ?? (await nextCardNumber(tx, ref.organisationId, ref.memberId, member.memberNumber)), actorUserId);
  await recordAuditEvent({ action: "CARD_ISSUED", actorUserId, organisationId: ref.organisationId, targetType: "MemberCard", targetId: card.id, metadata: existing ? { replaces: existing.id } : undefined, client: tx });
  return { card, created: true };
}

/**
 * Called when a term starts (lib/membership/service.ts activateTerm). A first activation issues the
 * card; renewals keep the card they have. A renewal for someone who never had a card on this plan
 * (members from before cards existed) also gets one, but a card a manager revoked is never brought
 * back by a renewal: that takes a manager's reissue. A new registration on a plan the member held a
 * card for before is a new membership, so it gets a new card number.
 */
export async function issueCardOnActivation(tx: Tx, term: { organisationId: string; memberId: string; planId: string; kind: string }, actorUserId: string | null) {
  const ref = { organisationId: term.organisationId, memberId: term.memberId, planId: term.planId };
  const earlier = await tx.memberCard.count({ where: ref });
  if (term.kind === "RENEWAL" && earlier > 0) return null;
  try {
    return await issueCard(tx, ref, actorUserId, { fresh: term.kind === "NEW" && earlier > 0 });
  } catch (error) {
    // An erased member gets no card, but their membership change still goes through.
    if (error instanceof CardError) return null;
    throw error;
  }
}

/** Replace the live card (lost card, changed details, a new role): the old one shows as replaced, the new one gets a new QR. */
export async function reissueCard(tx: Tx, ref: CardRef, actorUserId: string, reason?: "ROLE_CHANGED") {
  const member = await lockMember(tx, ref.organisationId, ref.memberId);
  const old = await liveCard(tx, ref);
  if (old) await tx.memberCard.update({ where: { id: old.id }, data: { revokedAt: new Date(), revokedById: actorUserId, revokedReason: "REISSUED" } });
  // The replacement keeps the printed number, even if the pattern has changed since.
  const card = await createCard(tx, ref, old?.cardNumber ?? (await nextCardNumber(tx, ref.organisationId, ref.memberId, member.memberNumber)), actorUserId);
  await recordAuditEvent({ action: old ? "CARD_REISSUED" : "CARD_ISSUED", actorUserId, organisationId: ref.organisationId, targetType: "MemberCard", targetId: card.id, metadata: old ? { replaces: old.id, ...(reason ? { reason } : {}) } : undefined, client: tx });
  return card;
}

/**
 * A member's primary role changed: each live card is reissued, so it carries the new role (and the
 * role's design) under a new QR, keeping its number. Returns how many were reissued.
 */
export async function reissueCardsForRoleChange(tx: Tx, organisationId: string, memberId: string, actorUserId: string) {
  const live = await tx.memberCard.findMany({ where: { organisationId, memberId, revokedAt: null }, select: { planId: true } });
  for (const card of live) await reissueCard(tx, { organisationId, memberId, planId: card.planId }, actorUserId, "ROLE_CHANGED");
  return live.length;
}

/** Revoke a live card. The membership itself is untouched; /verify shows the card as revoked. */
export async function revokeCard(tx: Tx, args: { organisationId: string; cardId: string; actorUserId: string }) {
  const card = await tx.memberCard.findFirst({ where: { id: args.cardId, organisationId: args.organisationId } });
  if (!card) throw new CardError("Card not found.");
  await lockMember(tx, args.organisationId, card.memberId);
  const { count } = await tx.memberCard.updateMany({ where: { id: card.id, revokedAt: null }, data: { revokedAt: new Date(), revokedById: args.actorUserId, revokedReason: "REVOKED" } });
  if (count === 0) throw new CardError("This card was already revoked.");
  await recordAuditEvent({ action: "CARD_REVOKED", actorUserId: args.actorUserId, organisationId: args.organisationId, targetType: "MemberCard", targetId: card.id, client: tx });
  return card;
}
