import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { isIpBlocked, recordFailedLogin } from "@/lib/ipBlock";
import { getClientIpFromHeaders } from "@/lib/rateLimit";
import { availableLoginMethods } from "@/lib/loginMethods";
import { safeAuthRedirect } from "@/lib/authRedirect";
import { auditSignInFailed } from "@/lib/authAudit";
import { throttledResponse } from "@/lib/signInBackoff";
import { findEnabledSamlProvider } from "./providers";
import { SamlRefusal, readSamlResponse, startSamlLogin } from "./service";
import { issueSamlTicket } from "./state";
import { flowCookieOptions, flowHash, newFlowToken, SAML_FLOW_COOKIE } from "./flow";

const base = (request: Request) => process.env.NEXT_PUBLIC_BASE_URL || request.url;
const toLogin = (request: Request, error: string) => NextResponse.redirect(new URL(`/login?error=${error}`, base(request)), 303);

/** The provider for a request, or the refusal to send: the method is off, or the provider is disabled or unknown. */
async function resolve(slug: string) {
  if (!(await availableLoginMethods()).includes("saml")) return null;
  return findEnabledSamlProvider(slug);
}

/** GET .../login: send the browser to the identity provider with an AuthnRequest (SP-initiated sign-in). */
export async function samlLogin(request: NextRequest, slug: string) {
  if (!(await checkRateLimit(request, "auth"))) return throttledResponse(60);
  const provider = await resolve(slug);
  if (!provider) return toLogin(request, "method_disabled");
  if (await isIpBlocked(getClientIpFromHeaders(request.headers))) return toLogin(request, "address_blocked");
  const callbackUrl = safeAuthRedirect(request.nextUrl.searchParams.get("callbackUrl"));
  try {
    // The cookie names this browser; the ACS copies its hash onto the ticket, and Auth.js's final post must send it back.
    const token = newFlowToken();
    const response = NextResponse.redirect(await startSamlLogin(provider, callbackUrl, flowHash(token)), 303);
    response.cookies.set(SAML_FLOW_COOKIE, token, { ...flowCookieOptions, secure: process.env.NODE_ENV === "production" });
    return response;
  } catch {
    return toLogin(request, "saml_failed");
  }
}

/**
 * POST .../acs: the identity provider's signed response. Everything is validated by the library and by us (see
 * lib/saml/service.ts); a valid response becomes a one-time ticket in the URL fragment of /login/saml, which posts it
 * to Auth.js. Any failure goes back to /login with `saml_failed` and a method and reason audit row.
 */
export async function samlAcs(request: NextRequest, slug: string) {
  if (!(await checkRateLimit(request, "auth"))) return throttledResponse(60);
  const provider = await resolve(slug);
  if (!provider) return toLogin(request, "method_disabled");
  const ip = getClientIpFromHeaders(request.headers);
  if (await isIpBlocked(ip)) return toLogin(request, "address_blocked");
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return toLogin(request, "saml_failed");
  }
  const field = (name: string) => { const value = form.get(name); return typeof value === "string" ? value : undefined; };
  try {
    const { identity, callbackUrl, flow } = await readSamlResponse(provider, { SAMLResponse: field("SAMLResponse"), RelayState: field("RelayState") });
    // The ticket keeps the hash of the flow cookie from the start; this POST is cross-site, so the cookie itself is checked at the final step.
    const ticket = await issueSamlTicket(provider.id, identity, flow);
    const target = new URL(`/login/saml?callbackUrl=${encodeURIComponent(callbackUrl)}`, base(request));
    target.hash = `ticket=${ticket}`;
    return NextResponse.redirect(target, 303);
  } catch (error) {
    await auditSignInFailed("saml", error instanceof SamlRefusal ? error.reason : "error");
    if (await recordFailedLogin(ip)) return toLogin(request, "address_blocked");
    return toLogin(request, "saml_failed");
  }
}
