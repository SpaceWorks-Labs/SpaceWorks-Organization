import "server-only";

import type { MembershipPlan, MembershipTerm, Organisation, Prisma, TermKind, TermStatus } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { enqueueOutbox } from "@/lib/outbox";
import { queueChatAlerts } from "@/lib/chat/notify";
import { issueCardOnActivation } from "@/lib/cards/issue";
import { canTransition, chargesJoiningFee, statusAt, type TermAction } from "./lifecycle";
import { graceUntil, localDate, renewalStartDay, termWindow } from "./periods";
import { lockMemberByEmail } from "./memberLock";

type Tx = Prisma.TransactionClient;
type OrgClock = Pick<Organisation, "id" | "timezone" | "financialYearStartMonth">;

/** How long an approved member has to pay before the unpaid term expires. */
const PAYMENT_DUE_DAYS = 14;

/** Statuses the database's no-overlap rule covers: a member holds at most one of these per plan at a time. */
const LIVE: TermStatus[] = ["UPCOMING", "ACTIVE", "GRACE"];

export class MembershipError extends Error {
  override name = "MembershipError";
}

/** Next value of a gapless per-organisation counter, allocated inside the caller's transaction. */
export async function nextCounter(tx: Tx, organisationId: string, name: string): Promise<number> {
  const [row] = await tx.$queryRaw<Array<{ value: number }>>`
    INSERT INTO "OrgCounter" ("organisationId", "name", "next") VALUES (${organisationId}, ${name}, 2)
    ON CONFLICT ("organisationId", "name") DO UPDATE SET "next" = "OrgCounter"."next" + 1
    RETURNING "next" - 1 AS value`;
  return Number(row.value);
}

type MemberInput = {
  email: string;
  name: string;
  phone?: string | null;
  stateCode?: string | null;
  unitId?: string | null;
  userId?: string | null;
  fieldValues?: Record<string, unknown>;
  /**
   * "merge" (default) adds `fieldValues` to the stored answers. "replace" stores `fieldValues` as the member's
   * whole answer object: the caller built it from the row it read with `lockMemberByEmail` in this transaction.
   */
  fieldValuesMode?: "merge" | "replace";
  source: "JOIN_FORM" | "MANUAL" | "IMPORT";
  isMinor?: boolean;
  guardianName?: string | null;
  guardianEmail?: string | null;
  guardianPhone?: string | null;
  /** Leave an existing member's unit as it is (a join form never moves anyone). */
  keepExistingUnit?: boolean;
};

/**
 * The organisation's record for this email, created on first sight with the next member number. The row is
 * locked first. Omitted (undefined) details keep their stored values; null clears them.
 */
export async function upsertMember(tx: Tx, organisationId: string, input: MemberInput) {
  const email = input.email.trim().toLowerCase();
  const existing = await lockMemberByEmail(tx, organisationId, email);
  // Prisma leaves undefined columns untouched on update and at their defaults on create.
  const profile = {
    name: input.name.trim(),
    phone: input.phone,
    stateCode: input.stateCode,
    ...(input.unitId !== undefined && !(input.keepExistingUnit && existing?.unitId) ? { unitId: input.unitId } : {}),
    isMinor: input.isMinor,
    guardianName: input.guardianName,
    guardianEmail: input.guardianEmail,
    guardianPhone: input.guardianPhone,
  };
  if (existing) {
    const fieldValues = input.fieldValuesMode === "replace" ? input.fieldValues : input.fieldValues && { ...(existing.fieldValues as Record<string, unknown>), ...input.fieldValues };
    return tx.member.update({
      where: { id: existing.id },
      data: {
        ...profile,
        ...(input.userId && !existing.userId ? { userId: input.userId } : {}),
        ...(fieldValues ? { fieldValues: fieldValues as Prisma.InputJsonValue } : {}),
      },
    });
  }
  const memberNumber = await nextCounter(tx, organisationId, "member");
  return tx.member.create({
    data: { organisationId, email, memberNumber, source: input.source, userId: input.userId ?? null, fieldValues: (input.fieldValues ?? {}) as Prisma.InputJsonValue, ...profile },
  });
}

async function recordEvent(tx: Tx, term: Pick<MembershipTerm, "id" | "organisationId">, from: TermStatus | null, to: TermStatus, effectiveAt: Date, actorUserId: string | null, cause: string) {
  await tx.termStatusEvent.create({ data: { organisationId: term.organisationId, termId: term.id, from, to, effectiveAt, actorUserId, cause } });
}

async function notifyMember(tx: Tx, term: Pick<MembershipTerm, "id" | "organisationId">, notice: string) {
  await enqueueOutbox(tx, "membership-notice", { termId: term.id, organisationId: term.organisationId, notice });
}

/** Lock a term row for an update, so concurrent decisions and payments cannot interleave. */
async function lockTerm(tx: Tx, organisationId: string, termId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "MembershipTerm" WHERE "id" = ${termId} AND "organisationId" = ${organisationId} FOR UPDATE`;
  if (rows.length === 0) throw new MembershipError("Membership not found.");
  return tx.membershipTerm.findUniqueOrThrow({ where: { id: termId }, include: { plan: true } });
}

/**
 * Open a membership term for a member. The plan decides the path:
 * - an application needing approval waits as PENDING_APPROVAL (managers adding someone skip this, unless they
 *   send the person to their unit's lead to verify, `needsVerification`: then no member email or chat alert goes
 *   out, as the importer alerts the leads once for the whole batch);
 * - otherwise a priced plan that is paid first waits as PENDING_PAYMENT;
 * - otherwise the term starts now (free plans, or plans that activate and charge later).
 */
export async function openTerm(
  tx: Tx,
  args: { org: OrgClock; plan: MembershipPlan; memberId: string; kind?: TermKind; renewedFromId?: string | null; byManager: boolean; needsVerification?: boolean; actorUserId: string | null; now?: Date },
) {
  const now = args.now ?? new Date();
  const { plan, org } = args;
  if (plan.archivedAt) throw new MembershipError("This plan is no longer offered.");
  const kind = args.kind ?? "NEW";
  const history = await tx.membershipTerm.findMany({ where: { memberId: args.memberId, planId: plan.id }, select: { id: true, status: true, startsAt: true, endsAt: true, graceUntil: true, createdAt: true } });
  // A term in grace has ended, so registering again then (rather than renewing) overlaps nothing.
  if (kind === "NEW" && history.some((term) => ["UPCOMING", "ACTIVE"].includes(statusAt(term, now)))) throw new MembershipError("This email already holds a current membership on this plan. Renew it instead.");
  const joiningFeeMinor = kind === "NEW" && plan.joiningFeeMinor > 0 && chargesJoiningFee(plan.rejoinFeeRule, history, now, plan.rejoinAfterDays) ? plan.joiningFeeMinor : 0;
  const priceMinor = kind === "RENEWAL" ? plan.priceRenewalMinor : plan.priceNewMinor;
  const due = priceMinor + joiningFeeMinor;

  const verify = kind === "NEW" && Boolean(args.needsVerification);
  const needsApproval = verify || (kind === "NEW" && !args.byManager && plan.joinMode === "APPROVAL");
  const waitsForPayment = !needsApproval && due > 0 && plan.paymentTiming === "PAY_THEN_ACTIVATE";
  const status: TermStatus = needsApproval ? "PENDING_APPROVAL" : waitsForPayment ? "PENDING_PAYMENT" : "PENDING_PAYMENT";

  let term = await tx.membershipTerm.create({
    data: {
      organisationId: org.id,
      memberId: args.memberId,
      planId: plan.id,
      status,
      kind,
      currency: plan.currency,
      priceMinor,
      joiningFeeMinor,
      renewedFromId: args.renewedFromId ?? null,
      paymentDueBy: waitsForPayment ? new Date(now.getTime() + PAYMENT_DUE_DAYS * 86_400_000) : null,
    },
  });
  await recordEvent(tx, term, null, status, now, args.actorUserId, kind === "RENEWAL" ? "renewal-started" : verify ? "sent-to-verify" : "applied");

  if (!needsApproval && !waitsForPayment) {
    term = await activateTerm(tx, { org, termId: term.id, actorUserId: args.actorUserId, cause: due > 0 ? "activated-before-payment" : "free-plan", now });
  } else if (!verify) {
    await notifyMember(tx, term, needsApproval ? "application-received" : "payment-requested");
    if (needsApproval) await queueChatAlerts(tx, org.id, "application", { termId: term.id });
  }
  return term;
}

/**
 * Start a term: fix its dates from the plan and, for a renewal, from the term it renews. A renewal paid
 * during the old term's grace ends that term now (it becomes ENDED, not LAPSED).
 */
export async function activateTerm(tx: Tx, args: { org: OrgClock; termId: string; actorUserId: string | null; cause: string; now?: Date }) {
  const now = args.now ?? new Date();
  const term = await lockTerm(tx, args.org.id, args.termId);
  const timeZone = args.org.timezone;
  const previous = term.renewedFromId ? await tx.membershipTerm.findUnique({ where: { id: term.renewedFromId } }) : null;
  const startDay = previous ? renewalStartDay(previous, term.plan, now, timeZone) : localDate(now, timeZone);
  const window = termWindow(term.plan, startDay, timeZone, args.org.financialYearStartMonth);
  if (!window) throw new MembershipError("This plan's end date has passed, so it can't start a membership.");
  const grace = graceUntil(window.endsAt, term.plan.graceDays, timeZone);
  const status = statusAt({ ...term, status: "ACTIVE", startsAt: window.startsAt, endsAt: window.endsAt, graceUntil: grace }, now);
  const endsPrevious = Boolean(previous && previous.endsAt && now >= previous.endsAt && ["ACTIVE", "GRACE", "LAPSED"].includes(previous.status));

  // Refused here rather than by the database, so a late payment is still receipted and flagged (settlePayment).
  const clash = await tx.membershipTerm.count({
    where: {
      OR: [
        {
          memberId: term.memberId, planId: term.planId, status: { in: LIVE }, id: { notIn: endsPrevious ? [term.id, previous!.id] : [term.id] },
          startsAt: { not: null, ...(window.endsAt ? { lt: window.endsAt } : {}) },
          OR: [{ endsAt: null }, { endsAt: { gt: window.startsAt } }],
        },
        ...(term.renewedFromId ? [{ renewedFromId: term.renewedFromId, id: { not: term.id }, status: { notIn: ["CANCELLED", "EXPIRED", "REJECTED"] as TermStatus[] } }] : []),
      ],
    },
  });
  if (clash) throw new MembershipError("This member already holds this membership for those dates.");

  if (previous && previous.endsAt && endsPrevious) {
    await tx.membershipTerm.update({ where: { id: previous.id }, data: { status: "ENDED" } });
    await recordEvent(tx, previous, previous.status, "ENDED", previous.endsAt, args.actorUserId, "renewed");
  }

  const updated = await tx.membershipTerm.update({
    where: { id: term.id },
    data: { status, startsAt: window.startsAt, endsAt: window.endsAt, graceUntil: grace, paymentDueBy: null },
  });
  await recordEvent(tx, updated, term.status, status, now, args.actorUserId, args.cause);
  await notifyMember(tx, updated, status === "UPCOMING" ? "renewal-confirmed" : "activated");
  await issueCardOnActivation(tx, updated, args.actorUserId, now);
  return updated;
}

/** Apply a manager's decision to a term. Every change writes a status event and an audit row. */
export async function decideTerm(
  tx: Tx,
  args: { org: OrgClock; termId: string; action: Exclude<TermAction, "markPaid" | "extend">; actorUserId: string; reason?: string | null; now?: Date },
) {
  const now = args.now ?? new Date();
  const term = await lockTerm(tx, args.org.id, args.termId);
  const current = statusAt(term, now);
  if (!canTransition(args.action, current)) throw new MembershipError("This membership changed meanwhile. Reload and try again.");
  let result: MembershipTerm;
  switch (args.action) {
    case "approve": {
      const due = term.priceMinor + term.joiningFeeMinor;
      if (due > 0 && term.plan.paymentTiming === "PAY_THEN_ACTIVATE") {
        result = await tx.membershipTerm.update({ where: { id: term.id }, data: { status: "PENDING_PAYMENT", decidedById: args.actorUserId, decidedAt: now, paymentDueBy: new Date(now.getTime() + PAYMENT_DUE_DAYS * 86_400_000) } });
        await recordEvent(tx, result, current, "PENDING_PAYMENT", now, args.actorUserId, "approved");
        await notifyMember(tx, result, "approved-pay-now");
      } else {
        await tx.membershipTerm.update({ where: { id: term.id }, data: { decidedById: args.actorUserId, decidedAt: now } });
        result = await activateTerm(tx, { org: args.org, termId: term.id, actorUserId: args.actorUserId, cause: "approved", now });
      }
      break;
    }
    case "reject":
    case "cancel":
    case "withdraw":
    case "revoke": {
      const to: TermStatus = args.action === "reject" ? "REJECTED" : args.action === "revoke" ? "REVOKED" : "CANCELLED";
      result = await tx.membershipTerm.update({ where: { id: term.id }, data: { status: to, decidedById: args.actorUserId, decidedAt: now, reason: args.reason ?? null } });
      await recordEvent(tx, result, current, to, now, args.actorUserId, args.action);
      if (args.action === "reject" || args.action === "revoke") await notifyMember(tx, result, args.action === "reject" ? "rejected" : "revoked");
      break;
    }
    case "reinstate": {
      const back = statusAt({ ...term, status: "ACTIVE" }, now);
      result = await tx.membershipTerm.update({ where: { id: term.id }, data: { status: back, decidedById: args.actorUserId, decidedAt: now, reason: args.reason ?? null } });
      await recordEvent(tx, result, current, back, now, args.actorUserId, "reinstated");
      break;
    }
  }
  await recordAuditEvent({ action: `MEMBERSHIP_${args.action.toUpperCase()}`, actorUserId: args.actorUserId, organisationId: args.org.id, targetType: "MembershipTerm", targetId: term.id, client: tx });
  return result;
}

/** Move a term's end date, with a reason (a goodwill extension or a correction). */
export async function extendTerm(tx: Tx, args: { org: OrgClock; termId: string; endsAt: Date; actorUserId: string; reason: string; now?: Date }) {
  const now = args.now ?? new Date();
  const term = await lockTerm(tx, args.org.id, args.termId);
  const current = statusAt(term, now);
  if (!canTransition("extend", current)) throw new MembershipError("Only a started membership can be extended.");
  if (!term.startsAt || args.endsAt <= term.startsAt) throw new MembershipError("The new end date must be after the start date.");
  const grace = graceUntil(args.endsAt, term.plan.graceDays, args.org.timezone);
  const status = statusAt({ ...term, status: "ACTIVE", endsAt: args.endsAt, graceUntil: grace }, now);
  const result = await tx.membershipTerm.update({ where: { id: term.id }, data: { endsAt: args.endsAt, graceUntil: grace, status, reason: args.reason } });
  await recordEvent(tx, result, current, status, now, args.actorUserId, "extended");
  await recordAuditEvent({ action: "MEMBERSHIP_EXTENDED", actorUserId: args.actorUserId, organisationId: args.org.id, targetType: "MembershipTerm", targetId: term.id, metadata: { endsAt: args.endsAt.toISOString() }, client: tx });
  return result;
}

/** Payment received for a term (offline confirmation now; gateways in P7). Revives an expired unpaid term. */
export async function markTermPaid(tx: Tx, args: { org: OrgClock; termId: string; actorUserId: string | null; now?: Date }) {
  const now = args.now ?? new Date();
  const term = await lockTerm(tx, args.org.id, args.termId);
  const current = statusAt(term, now);
  if (!canTransition("markPaid", current)) {
    // Already active (activate-then-charge plans) or decided: the money is still receipted elsewhere.
    return term;
  }
  return activateTerm(tx, { org: args.org, termId: term.id, actorUserId: args.actorUserId, cause: "paid", now });
}

/**
 * Begin a renewal for a member on a plan: from the latest term that can be renewed. A member whose last
 * term lapsed past grace rejoins with a new term instead.
 */
export async function startRenewal(tx: Tx, args: { org: OrgClock; plan: MembershipPlan; memberId: string; byManager: boolean; actorUserId: string | null; now?: Date }) {
  const now = args.now ?? new Date();
  const latest = await tx.membershipTerm.findFirst({
    where: { memberId: args.memberId, planId: args.plan.id, status: { in: ["UPCOMING", "ACTIVE", "GRACE", "LAPSED"] } },
    orderBy: { startsAt: "desc" },
  });
  if (!latest) return openTerm(tx, { ...args, kind: "NEW" });
  const status = statusAt(latest, now);
  if (status === "UPCOMING") throw new MembershipError("The next year is already paid for.");
  if (status === "LAPSED") return openTerm(tx, { ...args, kind: "NEW" });
  const startDay = renewalStartDay(latest, args.plan, now, args.org.timezone);
  if (!termWindow(args.plan, startDay, args.org.timezone, args.org.financialYearStartMonth)) throw new MembershipError("This plan's end date has passed, so it can't be renewed.");
  return openTerm(tx, { ...args, kind: "RENEWAL", renewedFromId: latest.id });
}
