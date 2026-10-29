import { syncSchedules } from "@/lib/queue/beat";
import { runProcess } from "./runtime";

void runProcess("beat", async () => {
  await syncSchedules();
  // Reconcile once per process start. BullMQ keeps producing repeats even while beat restarts.
  return { stop: async () => undefined, healthy: async () => true };
}).catch((error: unknown) => { console.error(`[queue] Beat startup failed: ${error instanceof Error ? error.message : "unknown error"}. Check Redis and job schedules.`); process.exit(1); });
