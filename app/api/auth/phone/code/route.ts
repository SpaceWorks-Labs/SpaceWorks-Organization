import { NextResponse } from "next/server";
import { getClientIpFromHeaders } from "@/lib/rateLimit";
import { startPhoneSignIn } from "@/lib/sms/signIn";

export const dynamic = "force-dynamic";

/**
 * Ask for a phone sign-in code. Always the same answer, whether or not the number belongs to an account; 429 with
 * Retry-After when the number, its country or the address is over its limit; 404 when phone sign-in is off.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { phone?: unknown } | null;
  const answer = await startPhoneSignIn({ phone: body?.phone, ip: getClientIpFromHeaders(request.headers) });
  const headers = { "cache-control": "no-store" };
  if (answer.status === 429) return NextResponse.json({ error: "Too many codes asked for. Try again later." }, { status: 429, headers: { ...headers, "retry-after": String(answer.retryAfterSeconds) } });
  if (answer.status === 404) return NextResponse.json({ error: answer.error }, { status: 404, headers });
  if (answer.status === 400) return NextResponse.json({ error: answer.error }, { status: 400, headers });
  return NextResponse.json({ ok: true }, { status: 200, headers });
}
