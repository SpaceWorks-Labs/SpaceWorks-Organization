import { createWorkers } from "@/lib/queue/worker";
import { runProcess } from "./runtime";

void runProcess("worker", async () => {
  const workers = createWorkers();
  await workers.ready();
  return {
    stop: workers.close,
    healthy: async () => (await Promise.all(workers.workers.map(async (worker) => worker.isRunning() && (await worker.client).status === "ready"))).every(Boolean),
  };
}).catch((error: unknown) => { console.error(`[queue] Worker startup failed: ${error instanceof Error ? error.message : "unknown error"}. Check Redis and database configuration.`); process.exit(1); });
