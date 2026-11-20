import { NextResponse, type NextRequest } from "next/server";
import { serve } from "inngest/next";
import { inngest, inngestEnabled, runDueJobs } from "@/lib/queue/inngest";

export const dynamic = "force-dynamic";
// A run usually finishes in seconds; hosts that cap request time read this.
export const maxDuration = 60;

// The SDK verifies every call against INNGEST_SIGNING_KEY before running anything.
const handlers = serve({ client: inngest, functions: [runDueJobs] });
const notFound = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });

/** Inngest's sync (PUT), introspection (GET) and run (POST) calls. Without Inngest configured the route does not exist. */
export async function GET(request: NextRequest, context: unknown) {
  return inngestEnabled() ? handlers.GET(request, context) : notFound();
}

export async function POST(request: NextRequest, context: unknown) {
  return inngestEnabled() ? handlers.POST(request, context) : notFound();
}

export async function PUT(request: NextRequest, context: unknown) {
  return inngestEnabled() ? handlers.PUT(request, context) : notFound();
}
