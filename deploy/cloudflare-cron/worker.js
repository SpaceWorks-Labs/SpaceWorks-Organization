// Runs Space Works Organization's background jobs from Cloudflare's free cron triggers, for hosts with no worker
// or beat (docs/DEPLOYMENT_CLOUD.md, "No worker at all"). Once a minute it calls POST /api/internal/run-jobs on your
// site with the CRON_SECRET bearer; the app runs the due jobs and delivers the outbox in that request.
// It has no public address (workers_dev = false in wrangler.toml) and logs only the status code.
export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runJobs(env));
  },
};

async function runJobs(env) {
  if (!env.SITE_URL || !env.CRON_SECRET) throw new Error("Set SITE_URL in wrangler.toml and the CRON_SECRET secret.");
  const response = await fetch(new URL("/api/internal/run-jobs", env.SITE_URL), {
    method: "POST",
    headers: { authorization: `Bearer ${env.CRON_SECRET}` },
    signal: AbortSignal.timeout(55_000),
  });
  console.log(`run-jobs answered ${response.status}`);
  // 500 means some jobs failed and will run again at their next occurrence; anything else unexpected is an error.
  if (!response.ok && response.status !== 500) throw new Error(`run-jobs answered ${response.status}`);
}
