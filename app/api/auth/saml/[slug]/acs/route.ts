import type { NextRequest } from "next/server";
import { samlAcs } from "@/lib/saml/routes";

export const dynamic = "force-dynamic";

/** The identity provider posts its response here (cross-site form POST; the website proxy lets this one path through). */
export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  return samlAcs(request, (await context.params).slug);
}
