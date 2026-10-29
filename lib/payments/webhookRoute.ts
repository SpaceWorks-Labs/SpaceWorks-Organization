import "server-only";

import { handleWebhook } from "./webhooks";

const MAX_BODY_BYTES = 256 * 1024;
const tooLarge = () => new Response("Payload too large", { status: 413 });

/** Read a request body up to `limit` bytes, giving up as soon as it grows past it (chunked bodies included). */
async function readCapped(request: Request, limit: number): Promise<string | null> {
  if (Number(request.headers.get("content-length") ?? 0) > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** Shared route body: a hard size cap, raw text for the signature check, plain-text answer. */
export async function webhookResponse(provider: "RAZORPAY" | "STRIPE", code: string, request: Request) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(code)) return new Response("Not found", { status: 404 });
  const body = await readCapped(request, MAX_BODY_BYTES);
  if (body === null) return tooLarge();
  const outcome = await handleWebhook(provider, code, body, request.headers);
  return new Response(outcome.body, { status: outcome.status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
