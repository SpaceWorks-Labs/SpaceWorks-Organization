import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { queueChatAlerts } from "@/lib/chat/notify";
import { money } from "@/lib/membership/describe";
import { CLAIM_PENDING_HOURS, GRACE_ENDING_DAYS, type MemberMessageKind } from "@/lib/messages/kinds";
import { localMinutes } from "@/lib/notify/quiet";
import { queueMemberMessage } from "@/lib/notify/send";
import { termMessageValues } from "@/lib/notify/values";

const BATCH = 500;
const DAY_MS = 86_400_000;
const WINDOW_DAYS = 30;
/** The hour (organisation time) the daily digest of reminders goes to its chat destinations. */
const DIGEST_HOUR = 8;

/**
 * Queue one message once: the ReminderLog row (term and key) and the message are written together, and the log's
 * primary key makes a second attempt a no-op, so a sweep that runs twice, or two workers, send it once.
 */
async function once(term: { id: string; organisationId: string; memberId: string }, key: string, kind: MemberMessageKind, values: Record<string, string | null>) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.reminderLog.create({ data: { termId: term.id, key } });
      await queueMemberMessage(tx, { organisationId: term.organisationId, memberId: term.memberId, kind, values, dedupeKey: `reminder:${term.id}:${key}` });
    });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
}

/** Terms that ended without a renewal behind them, still on their plan, belonging to a person who has not been erased. */
const unrenewed: Prisma.MembershipTermWhereInput = { renewals: { none: { status: { notIn: ["CANCELLED", "EXPIRED", "REJECTED"] } } }, member: { anonymisedAt: null } };

/** Grace started, grace ending (the last days) and lapsed: each once per term. */
export async function queueLifecycleReminders(now = new Date()) {
  let queued = 0;
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
  const pick = { id: true, organisationId: true, memberId: true, reminders: { select: { key: true } } } as const;
  const groups: Array<{ kind: MemberMessageKind; key: string; where: Prisma.MembershipTermWhereInput }> = [
    { kind: "grace-started", key: "grace-started", where: { status: "GRACE", endsAt: { lte: now, gte: since }, graceUntil: { gt: now } } },
    { kind: "grace-ending", key: "grace-ending", where: { status: "GRACE", graceUntil: { gt: now, lte: new Date(now.getTime() + GRACE_ENDING_DAYS * DAY_MS) } } },
    { kind: "lapsed", key: "lapsed", where: { status: "LAPSED", endsAt: { gte: since }, graceUntil: { lte: now } } },
  ];
  for (const group of groups) {
    const terms = await prisma.membershipTerm.findMany({ where: { ...unrenewed, ...group.where, reminders: { none: { key: group.key } } }, select: pick, take: BATCH });
    for (const term of terms) {
      const values = await termMessageValues(term.id, term.organisationId);
      if (values && (await once(term, group.key, group.kind, values))) queued += 1;
    }
  }
  return { queuedLifecycle: queued };
}

/**
 * Claims the team has not confirmed a day later: the member is told it is still being checked, and the organisation's
 * chat destinations get the payment-to-confirm alert (queued with the message). Once per payment.
 */
export async function queueClaimReminders(now = new Date()) {
  let queued = 0;
  const payments = await prisma.payment.findMany({
    where: { memberClaim: true, status: "AWAITING_CONFIRMATION", termId: { not: null }, createdAt: { lte: new Date(now.getTime() - CLAIM_PENDING_HOURS * 3_600_000), gte: new Date(now.getTime() - WINDOW_DAYS * DAY_MS) }, member: { anonymisedAt: null } },
    select: { id: true, termId: true, organisationId: true, memberId: true, amountMinor: true, currency: true, organisation: { select: { locale: true } } },
    take: BATCH,
  });
  for (const payment of payments) {
    const key = `claim-${payment.id}`;
    if (await prisma.reminderLog.findUnique({ where: { termId_key: { termId: payment.termId!, key } } })) continue;
    const values = await termMessageValues(payment.termId!, payment.organisationId);
    if (!values) continue;
    const term = { id: payment.termId!, organisationId: payment.organisationId, memberId: payment.memberId };
    if (await once(term, key, "payment-claim-pending", { ...values, amount: money(payment.amountMinor, payment.currency, payment.organisation.locale), paymentId: payment.id })) queued += 1;
  }
  return { queuedClaims: queued };
}

/** Once a day, at eight in the morning of the organisation's own day, tell the chat destinations that asked how many reminders went out. */
export async function queueReminderDigests(now = new Date()) {
  let queued = 0;
  const channels = await prisma.chatChannel.findMany({ where: { enabled: true, events: { has: "reminders-digest" } }, select: { organisationId: true }, distinct: ["organisationId"], take: BATCH });
  for (const { organisationId } of channels) {
    const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { timezone: true, status: true } });
    if (!org || org.status !== "ACTIVE" || localMinutes(now, org.timezone) < DIGEST_HOUR * 60) continue;
    const today = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: org.timezone }).format(now)}T00:00:00Z`);
    await prisma.orgMessagingSettings.upsert({ where: { organisationId }, create: { organisationId }, update: {} });
    const claimed = await prisma.$transaction(async (tx) => {
      // The guarded update is the once-a-day lock: only one worker moves the date.
      const moved = await tx.orgMessagingSettings.updateMany({ where: { organisationId, OR: [{ lastDigestOn: null }, { lastDigestOn: { lt: today } }] }, data: { lastDigestOn: today } });
      if (moved.count !== 1) return false;
      await queueChatAlerts(tx, organisationId, "reminders-digest", {});
      return true;
    });
    if (claimed) queued += 1;
  }
  return { queuedDigests: queued };
}
