import "server-only";

import { CronExpressionParser } from "cron-parser";
import { prisma } from "@/lib/db";
import { getQueues, type Queues } from "./client";
import { jobId, scheduleDefinitions, type JobDefinition } from "./definitions";

/** SQL is the durable outbox. Redis carries row ids, never email content or bearer links. */
export async function enqueueDueOutbox(queues: Queues = getQueues()) {
  const now = new Date();
  const rows = await prisma.outboxMessage.findMany({
    where: { OR: [
      { status: "PENDING", availableAt: { lte: now } },
      { status: "PROCESSING", lockedAt: { lt: new Date(now.getTime() - 15 * 60_000) } },
    ] },
    select: { id: true }, orderBy: { createdAt: "asc" }, take: 100,
  });
  await queues.outbox.addBulk(rows.map((row) => ({ name: "deliver", data: { kind: "outbox" as const, outboxId: row.id }, opts: { jobId: jobId("outbox", `${row.id}-${now.getTime()}`) } })));
  return { enqueued: rows.length };
}

/**
 * For hosts that cannot keep a beat process (an external cron calls POST /api/internal/jobs once a minute).
 * Time-bucket ids make repeated calls in the same minute harmless.
 */
export async function enqueueScheduledTick(registry: readonly JobDefinition[], queues: Queues = getQueues(), now = Date.now()) {
  for (const item of scheduleDefinitions(registry)) {
    let occurrence: number;
    if ("every" in item.schedule) occurrence = Math.floor(now / item.schedule.every) * item.schedule.every;
    else {
      occurrence = CronExpressionParser.parse(item.schedule.pattern, { currentDate: new Date(now + 1), tz: item.schedule.tz ?? "UTC" }).prev().getTime();
      if (now - occurrence >= 60_000) continue;
    }
    await queues[item.queue].add(item.data.area, item.data, { jobId: jobId("tick", `${item.id}-${occurrence}`) });
  }
}
