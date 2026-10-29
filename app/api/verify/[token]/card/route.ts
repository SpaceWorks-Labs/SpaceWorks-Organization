import { loadPublicCard } from "@/lib/cards/publicCard";
import { VERIFY_TOKEN_PATTERN } from "@/lib/cards/core";
import { renderMemberCard } from "@/lib/cards/render";
import { jsonError, notFoundResponse, PRIVATE_HEADERS } from "@/lib/downloads";
import { checkRateLimitById, getClientIpFromHeaders } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * The card on the public check page, as a PNG of one side: GET /api/verify/{token}/card?side=front|back. Only a live,
 * current card in an active organisation draws (lib/cards/publicCard.ts); anything else is the same 404. Drawn on
 * demand and never stored or cached.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!VERIFY_TOKEN_PATTERN.test(token)) return notFoundResponse();
  if (!(await checkRateLimitById("verifyCardImage", getClientIpFromHeaders(request.headers)))) return jsonError(429, "Too many card checks. Try again later.");
  const side = new URL(request.url).searchParams.get("side") === "back" ? "back" : "front";
  const loaded = await loadPublicCard(token);
  if (!loaded || (side === "back" && !loaded.input.design.backEnabled)) return notFoundResponse();
  const body = await renderMemberCard(loaded.input, loaded.holder, "png", { side, title: `${loaded.holder.displayName} membership card` });
  return new Response(body as unknown as BodyInit, { headers: { ...PRIVATE_HEADERS, "Content-Type": "image/png" } });
}
