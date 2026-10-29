import "server-only";

import { getQueues, type Queues } from "./client";
import { JOB_OPTIONS, QUEUE_NAMES, scheduleDefinitions, type JobDefinition } from "./definitions";
import { SCHEDULED_JOBS } from "./registry";

/** Upserts are atomic in BullMQ, so two beat instances produce the same schedule. Removed areas are dropped. */
export async function syncSchedules(queues: Queues = getQueues(), registry: readonly JobDefinition[] = SCHEDULED_JOBS) {
  const definitions = scheduleDefinitions(registry);
  for (const name of QUEUE_NAMES) {
    const desired = definitions.filter((item) => item.queue === name);
    for (const item of desired) {
      await queues[name].upsertJobScheduler(item.id, item.schedule, { name: item.data.area, data: item.data, opts: JOB_OPTIONS });
    }
    const existing = await queues[name].getJobSchedulers(0, -1);
    for (const item of existing) {
      if (item.key.startsWith("registry-") && !desired.some((next) => next.id === item.key)) await queues[name].removeJobScheduler(item.key);
    }
  }
  return { schedules: definitions.length };
}
