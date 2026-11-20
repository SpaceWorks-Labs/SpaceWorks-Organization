import { NextResponse } from "next/server";
import { bearerSecretMatches } from "@/lib/bearerSecret";
import { runDueJobsInline } from "@/lib/queue/inline";

export const dynamic = "force-dynamic";
// Hosts that cap request time read this; a call usually finishes in seconds.
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/**
 * For hosts with no worker or beat: an online cron (deploy/cloudflare-cron) calls this once a minute and the due jobs
 * run in this request, outbox delivery included. Use this or a worker, not both at once.
 */
export async function POST(request: Request) {
  if (!bearerSecretMatches(request.headers.get("authorization"), process.env.CRON_SECRET)) return new NextResponse("Not found", { status: 404, headers });
  try {
    const result = await runDueJobsInline();
    return NextResponse.json({ ok: result.failed.length === 0, ...result }, { status: result.failed.length ? 500 : 200, headers });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers });
  }
}
