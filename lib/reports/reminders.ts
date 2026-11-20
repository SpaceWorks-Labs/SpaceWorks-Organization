import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { enqueueOutbox } from "@/lib/outbox";
import { statusAt } from "@/lib/membership/lifecycle";
import { localDate } from "@/lib/membership/periods";
import { scopedMemberWhere } from "./source";
import type { TeamScope } from "@/lib/membership/scope";
import { dayKey } from "./period";

/**
 * Queue manual renewal reminders. The ReminderLog key is `before-manual-<day>` before the end date and
 * `after-manual-<day>` after it, so the renewal-reminder email picks the right wording ("Time to renew"
 * or "Your membership has ended") and the log's primary key allows one manual reminder per day.
 */
export async function queueManualReminders(scope: TeamScope, timezone: string, termIds: string[], now = new Date()) {
  const terms = await prisma.membershipTerm.findMany({
    where: {
      id: { in: termIds },
      organisationId: scope.organisationId,
      member: { is: { ...scopedMemberWhere({ organisationId: scope.organisationId, unitPath: scope.unitPath, limits: scope.limits }), anonymisedAt: null } },
      status: { in: ["ACTIVE", "GRACE", "LAPSED"] },
      endsAt: { not: null },
      renewals: { none: { status: { notIn: ["CANCELLED", "EXPIRED", "REJECTED"] } } },
    },
    select: { id: true, organisationId: true, status: true, startsAt: true, endsAt: true, graceUntil: true, createdAt: true },
  });
  const today = dayKey(localDate(now, timezone));
  let queued = 0;
  for (const term of terms) {
    const status = statusAt(term, now);
    if (!["ACTIVE", "GRACE", "LAPSED"].includes(status)) continue;
    const key = `${now >= term.endsAt! ? "after" : "before"}-manual-${today}`;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.reminderLog.create({ data: { termId: term.id, key, sentAt: now } });
        await enqueueOutbox(tx, "renewal-reminder", { termId: term.id, organisationId: term.organisationId, key });
      });
      queued += 1;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }
  return { queued, skipped: termIds.length - queued };
}
