import "server-only";

import { Prisma, type TermStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { enqueueOutbox } from "@/lib/outbox";
import { runStatsRollup } from "@/lib/reports/rollup";
import { statusAt } from "./lifecycle";

const BATCH = 500;
const DAY_MS = 86_400_000;

/** The domain time a timed status change happened, for the status event. */
function boundaryFor(to: TermStatus, term: { startsAt: Date | null; endsAt: Date | null; graceUntil: Date | null; paymentDueBy: Date | null }, now: Date) {
  if (to === "ACTIVE") return term.startsAt ?? now;
  if (to === "GRACE" || to === "ENDED") return term.endsAt ?? now;
  if (to === "LAPSED") return term.graceUntil ?? term.endsAt ?? now;
  if (to === "EXPIRED") return term.paymentDueBy ?? now;
  return now;
}

/**
 * Bring stored statuses in line with the clock. Idempotent: running it twice changes nothing the second
 * time. Each change is a guarded update (`status` must still be what was read), so two workers never
 * double-write.
 */
export async function sweepTermStatuses(now = new Date()) {
  let changed = 0;
  const candidates = await prisma.membershipTerm.findMany({
    where: {
      OR: [
        { status: "UPCOMING", startsAt: { lte: now } },
        { status: "ACTIVE", endsAt: { lte: now } },
        { status: "GRACE", graceUntil: { lte: now } },
        { status: "PENDING_PAYMENT", paymentDueBy: { lte: now } },
      ],
    },
    select: { id: true, organisationId: true, status: true, startsAt: true, endsAt: true, graceUntil: true, paymentDueBy: true, createdAt: true },
    take: BATCH,
  });
  for (const term of candidates) {
    const successor = await prisma.membershipTerm.count({ where: { renewedFromId: term.id, status: { in: ["UPCOMING", "ACTIVE", "GRACE", "ENDED"] } } });
    const to = statusAt(term, now, successor > 0);
    if (to === term.status) continue;
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.membershipTerm.updateMany({ where: { id: term.id, status: term.status }, data: { status: to } });
      if (result.count !== 1) return false;
      await tx.termStatusEvent.create({
        data: { organisationId: term.organisationId, termId: term.id, from: term.status, to, effectiveAt: boundaryFor(to, term, now), cause: "sweep" },
      });
      return true;
    });
    if (updated) changed += 1;
  }
  return { changed };
}

/**
 * Queue renewal reminders that are due: `before-N` from N days before the end, `after-N` from N days
 * after it. The ReminderLog row and the outbox row are written together, and the log's primary key makes
 * each reminder go out once. Terms already renewed are skipped.
 */
export async function queueRenewalReminders(now = new Date()) {
  let queued = 0;
  const horizon = new Date(now.getTime() + 60 * DAY_MS);
  const terms = await prisma.membershipTerm.findMany({
    where: {
      status: { in: ["ACTIVE", "GRACE", "LAPSED"] },
      endsAt: { not: null, lte: horizon, gte: new Date(now.getTime() - 60 * DAY_MS) },
      renewals: { none: { status: { notIn: ["CANCELLED", "EXPIRED", "REJECTED"] } } },
      member: { anonymisedAt: null },
    },
    select: { id: true, organisationId: true, memberId: true, planId: true, endsAt: true, plan: { select: { reminderDaysBefore: true, reminderDaysAfter: true } }, reminders: { select: { key: true } } },
    take: BATCH,
  });
  for (const term of terms) {
    const sent = new Set(term.reminders.map((reminder) => reminder.key));
    const end = term.endsAt!.getTime();
    const due = [
      ...term.plan.reminderDaysBefore.map((days) => ({ key: `before-${days}`, at: end - days * DAY_MS })),
      ...term.plan.reminderDaysAfter.map((days) => ({ key: `after-${days}`, at: end + days * DAY_MS })),
    ]
      .filter((reminder) => reminder.at <= now.getTime() && !sent.has(reminder.key))
      // Only the most recent due reminder; older missed ones are not sent late.
      .sort((a, b) => b.at - a.at)
      .slice(0, 1);
    // A member who rejoined with a new term (not linked as a renewal) is not reminded about the old one.
    if (due.length && (await prisma.membershipTerm.count({ where: { memberId: term.memberId, planId: term.planId, status: { in: ["UPCOMING", "ACTIVE", "GRACE"] }, startsAt: { gte: term.endsAt! } } }))) continue;
    for (const reminder of due) {
      try {
        await prisma.$transaction(async (tx) => {
          // Mark every older reminder as handled too, so a sweep after downtime sends one email, not three.
          const older = [...term.plan.reminderDaysBefore.map((d) => ({ key: `before-${d}`, at: end - d * DAY_MS })), ...term.plan.reminderDaysAfter.map((d) => ({ key: `after-${d}`, at: end + d * DAY_MS }))]
            .filter((r) => r.at <= reminder.at && !sent.has(r.key))
            .map((r) => ({ termId: term.id, key: r.key }));
          await tx.reminderLog.createMany({ data: older, skipDuplicates: true });
          await enqueueOutbox(tx, "renewal-reminder", { termId: term.id, organisationId: term.organisationId, key: reminder.key });
        });
        queued += 1;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      }
    }
  }
  return { queued };
}

/** One full membership pass, run by the background worker. The report rollup runs last, on settled statuses. */
export async function runMembershipSweep(now = new Date()) {
  const statuses = await sweepTermStatuses(now);
  const reminders = await queueRenewalReminders(now);
  const rollup = await runStatsRollup(now).catch(() => {
    console.error("[membership sweep] report rollup failed");
    return { rollupDays: 0 };
  });
  return { ...statuses, ...reminders, ...rollup };
}
