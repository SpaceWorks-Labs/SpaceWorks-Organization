import "server-only";

import { Inngest } from "inngest";
import { runDueJobsInline } from "./inline";

/**
 * The fully cloud option for background jobs (docs/DEPLOYMENT_CLOUD.md): Inngest calls `/api/inngest` on a cron and
 * the due registry jobs run in that request (`runDueJobsInline`), so no worker or beat runs. Servers keep BullMQ.
 * One run a minute with no steps and no retries is about 44,000 executions a month, inside Inngest's free plan;
 * `INNGEST_JOBS_CRON` can slow it down. A failed job fails the run and runs again at its next occurrence.
 */
export const inngest = new Inngest({ id: "spaceworks-organization" });

export const DEFAULT_JOBS_CRON = "* * * * *";

export const runDueJobs = inngest.createFunction(
  {
    id: "run-due-jobs",
    name: "Run due background jobs",
    retries: 0,
    concurrency: { limit: 1 },
    triggers: [{ cron: process.env.INNGEST_JOBS_CRON || DEFAULT_JOBS_CRON }],
  },
  async () => {
    const result = await runDueJobsInline();
    // Job names only: nothing about members or messages leaves the app.
    if (result.failed.length) throw new Error(`Background jobs failed: ${result.failed.join(", ")}`);
    return { ran: result.ran, outbox: result.outbox };
  },
);

/** Inngest is switched on by its signing key, or by the local Inngest dev server outside production. */
export function inngestEnabled() {
  if (process.env.INNGEST_SIGNING_KEY) return true;
  return process.env.NODE_ENV !== "production" && process.env.INNGEST_DEV === "1";
}
