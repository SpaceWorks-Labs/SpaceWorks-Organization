import type { NextRequest } from "next/server";
import { samlLogin } from "@/lib/saml/routes";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  return samlLogin(request, (await context.params).slug);
}
