import { handleVisit } from "@/lib/visits/handle";
import { MAX_VISIT_BODY } from "@/lib/visits/route";

export const dynamic = "force-dynamic";

/** The body as text, or null when it is longer than a visit ever is. Reads no more than the cap, whatever Content-Length says. */
async function readCapped(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_VISIT_BODY) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_VISIT_BODY) {
        await reader.cancel();
        return null;
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Counts one public page view (product rules section 8.1): route template only, no cookie, no storage, no
 * person. Always 204, so a caller learns nothing about why a visit was or was not counted.
 */
export async function POST(request: Request) {
  try {
    const body = await readCapped(request);
    if (body !== null) await handleVisit(new Request(request.url, { method: "POST", headers: request.headers, body }));
  } catch {
    console.error("[visits] a visit could not be counted");
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
