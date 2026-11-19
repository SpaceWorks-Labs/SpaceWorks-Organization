import { handleVisit } from "@/lib/visits/handle";

export const dynamic = "force-dynamic";

/**
 * Counts one public page view (product rules section 8.1): route template only, no cookie, no storage, no
 * person. Always 204, so a caller learns nothing about why a visit was or was not counted.
 */
export async function POST(request: Request) {
  try {
    await handleVisit(request);
  } catch {
    console.error("[visits] a visit could not be counted");
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
