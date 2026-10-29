export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateRuntimeEnvironment } = await import("@/lib/env");
    validateRuntimeEnvironment();
    // Background work runs in the BullMQ worker and beat roles. Local development without Redis can opt in
    // to an in-process timer instead.
    if (process.env.NODE_ENV !== "production" && !process.env.REDIS_URL && process.env.JOBS_INPROCESS === "true") {
      const { startOutboxWorker } = await import("@/lib/outboxWorker");
      startOutboxWorker();
    }
  }
}
