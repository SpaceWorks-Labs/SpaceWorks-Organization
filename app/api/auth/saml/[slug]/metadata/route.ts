import type { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { findSamlProviderBySlug } from "@/lib/saml/providers";
import { samlMetadata } from "@/lib/saml/service";

export const dynamic = "force-dynamic";

/** Our service-provider metadata for the identity provider's administrator. Public setup information, no secrets. */
export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  if (!(await checkRateLimit(request, "apiRead"))) return new Response("Too many requests", { status: 429, headers: { "Retry-After": "60" } });
  const provider = await findSamlProviderBySlug((await context.params).slug);
  if (!provider) return new Response("Not found", { status: 404 });
  return new Response(samlMetadata(provider), { headers: { "Content-Type": "application/samlmetadata+xml; charset=utf-8", "Cache-Control": "no-store" } });
}
