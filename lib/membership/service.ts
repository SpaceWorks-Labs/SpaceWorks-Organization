import "server-only";

import type { MembershipPlan, MembershipTerm, Organisation, Prisma, TermKind, TermStatus } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { enqueueOutbox } from "@/lib/outbox";
import { queueChatAlerts } from "@/lib/chat/notify";
import { issueCardOnActivation } from "@/lib/cards/issue";
import { endLiveCards, restoreCardOnReinstate } from "./termCards";
import { canTransition, chargesJoiningFee, statusAt, type TermAction } from "./lifecycle";
import { MembershipError } from "./errors";
import { effectiveGraceDays } from "./lapsePolicy";
import { evaluateRenewal, type RenewalReask } from "./renewalRules";
import { graceUntil, localDate, renewalStartDay, termWindow } from "./periods";

type Tx = Prisma.TransactionClient;
type OrgClock = Pick<Organisation, "id" | "timezone" | "financialYearStartMonth">;

/** How long an approved member has to pay before the unpaid term expires. */
const PAYMENT_DUE_DAYS = 14;

/** Statuses the database's no-overlap rule covers: a member holds at most one of these per plan at a time. */
const LIVE: TermStatus[] = ["UPCOMING", "ACTIVE", "GRACE"];

export { MembershipError };

export { nextCounter } from "./counter";
export { upsertMember } from "./upsertMember";

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
  args: { org: OrgClock; plan: MembershipPlan; memberId: string; kind?: TermKind; renewedFromId?: string | null; renewalNeedsApproval?: boolean; byManager: boolean; needsVerification?: boolean; actorUserId: string | null; now?: Date },
) {
  const now = args.now ?? new Date();
  const { plan, org } = args;
  if (plan.archivedAt) throw new MembershipError("This plan is no longer offered.");
  const kind = args.kind ?? "NEW";
  const history = await tx.membershipTerm.findMany({ where: { memberId: args.memberId, planId: plan.id }, select: { id: true, status: true, startsAt: true, endsAt: true, graceUntil: true, createdAt: true } });
  // A term in grace has ended, so registering again then (rather than renewing) overlaps nothing.
  if (kind === "NEW" && history.some((term) => ["UPCOMING", "ACTIVE"].includes(statusAt(term, now)))) throw new MembershipError("This email already holds a current membership on this plan. Renew it instead.");
  // A free plan charges nothing, whatever its stored prices say.
  const free = plan.paymentMode === "FREE";
  const joiningFeeMinor = kind === "NEW" && !free && plan.joiningFeeMinor > 0 && chargesJoiningFee(plan.rejoinFeeRule, history, now, plan.rejoinAfterDays) ? plan.joiningFeeMinor : 0;
  const priceMinor = free ? 0 : kind === "RENEWAL" ? plan.priceRenewalMinor : plan.priceNewMinor;
  const due = priceMinor + joiningFeeMinor;

  const verify = kind === "NEW" && Boolean(args.needsVerification);
  const needsApproval = verify || (kind === "NEW" && !args.byManager && plan.joinMode === "APPROVAL") || (kind === "RENEWAL" && Boolean(args.renewalNeedsApproval));
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
  const grace = graceUntil(window.endsAt, effectiveGraceDays(term.plan), timeZone);
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
  await recordAuditEvent({ action: `MEMBERSHIP_${args.action.toUpperCase()}`, actorUserId: args.actorUserId, organisationId: args.org.id, targetType: "MembershipTerm", targetId: term.id, metadata: { memberId: term.memberId, planId: term.planId, ...(args.reason ? { reason: args.reason.slice(0, 200) } : {}) }, client: tx });
  if (args.action === "revoke" || args.action === "cancel" || args.action === "withdraw") await endLiveCards(tx, { organisationId: args.org.id, memberId: term.memberId, planId: term.planId, actorUserId: args.actorUserId });
  if (args.action === "reinstate") await restoreCardOnReinstate(tx, { organisationId: args.org.id, memberId: term.memberId, planId: term.planId, actorUserId: args.actorUserId });
  return result;
}

/** Move a term's end date, with a reason (a goodwill extension or a correction). */
export async function extendTerm(tx: Tx, args: { org: OrgClock; termId: string; endsAt: Date; actorUserId: string; reason: string; now?: Date }) {
  const now = args.now ?? new Date();
  const term = await lockTerm(tx, args.org.id, args.termId);
  const current = statusAt(term, now);
  if (!canTransition("extend", current)) throw new MembershipError("Only a started membership can be extended.");
  if (!term.startsAt || args.endsAt <= term.startsAt) throw new MembershipError("The new end date must be after the start date.");
  const grace = graceUntil(args.endsAt, effectiveGraceDays(term.plan), args.org.timezone);
  const status = statusAt({ ...term, status: "ACTIVE", endsAt: args.endsAt, graceUntil: grace }, now);
  const result = await tx.membershipTerm.update({ where: { id: term.id }, data: { endsAt: args.endsAt, graceUntil: grace, status, reason: args.reason } });
  await recordEvent(tx, result, current, status, now, args.actorUserId, "extended");
  await recordAuditEvent({ action: "MEMBERSHIP_EXTENDED", actorUserId: args.actorUserId, organisationId: args.org.id, targetType: "MembershipTerm", targetId: term.id, metadata: { endsAt: args.endsAt.toISOString(), memberId: term.memberId, planId: term.planId, reason: args.reason.slice(0, 200) }, client: tx });
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
 * term lapsed past grace rejoins with a new term instead. The plan's renewal conditions are checked here
 * (lib/membership/renewalRules.ts): the window, who may renew, the details asked again, approval, and
 * renewing into another plan. Staff skip the window, eligibility and the questions asked again.
 */
export async function startRenewal(tx: Tx, args: { org: OrgClock; plan: MembershipPlan; memberId: string; byManager: boolean; actorUserId: string | null; reask?: RenewalReask; now?: Date }) {
  const now = args.now ?? new Date();
  const latest = await tx.membershipTerm.findFirst({
    where: { memberId: args.memberId, planId: args.plan.id, status: { in: ["UPCOMING", "ACTIVE", "GRACE", "LAPSED"] } },
    orderBy: { startsAt: "desc" },
  });
  if (!latest) return openTerm(tx, { ...args, kind: "NEW" });
  const status = statusAt(latest, now);
  if (status === "UPCOMING") throw new MembershipError("The next year is already paid for.");
  if (status === "LAPSED") return openTerm(tx, { ...args, kind: "NEW" });
  const waiting = await tx.membershipTerm.count({ where: { renewedFromId: latest.id, status: { notIn: ["CANCELLED", "EXPIRED", "REJECTED", "REVOKED"] } } });
  if (waiting > 0) throw new MembershipError("This membership already has a renewal in progress.");
  const checked = await evaluateRenewal(tx, { org: args.org, plan: args.plan, memberId: args.memberId, latest, byManager: args.byManager, reask: args.reask, now });
  const startDay = renewalStartDay(latest, args.plan, now, args.org.timezone);
  if (!termWindow(checked.plan, startDay, args.org.timezone, args.org.financialYearStartMonth)) throw new MembershipError("This plan's end date has passed, so it can't be renewed.");
  const term = await openTerm(tx, { ...args, plan: checked.plan, kind: "RENEWAL", renewedFromId: latest.id, renewalNeedsApproval: checked.needsApproval });
  if (checked.intoPlan) {
    await recordEvent(tx, term, term.status, term.status, now, args.actorUserId, "renewed-into-plan");
    await recordAuditEvent({ action: "MEMBERSHIP_RENEWED_INTO_PLAN", actorUserId: args.actorUserId, organisationId: args.org.id, targetType: "MembershipTerm", targetId: term.id, metadata: { fromPlanId: args.plan.id, toPlanId: checked.plan.id, memberId: args.memberId, planId: checked.plan.id }, client: tx });
  }
  return term;
}
