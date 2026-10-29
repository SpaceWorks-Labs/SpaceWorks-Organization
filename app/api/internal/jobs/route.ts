import { NextResponse } from "next/server";
import { enqueueScheduledTick } from "@/lib/queue/enqueue";
import { SCHEDULED_JOBS } from "@/lib/queue/registry";
import { bearerSecretMatches } from "@/lib/bearerSecret";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/** For hosts without a beat process: an external cron calls this once a minute. Workers still run the jobs. */
export async function POST(request: Request) {
  if (!bearerSecretMatches(request.headers.get("authorization"), process.env.CRON_SECRET)) return new NextResponse("Not found", { status: 404, headers });
  try {
    await enqueueScheduledTick(SCHEDULED_JOBS);
    return new NextResponse(null, { status: 204, headers });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers });
  }
}
