import "server-only";

import { cookies } from "next/headers";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { isIpBlocked } from "@/lib/ipBlock";
import { getClientIpFromHeaders } from "@/lib/rateLimit";
import { auditSignInFailed } from "@/lib/authAudit";
import { consumeSamlTicket } from "@/lib/saml/state";
import { readFlowToken, SAML_FLOW_COOKIE } from "@/lib/saml/flow";
import { samlProviderKey } from "@/lib/saml/keys";
import { signInExternalIdentity } from "./externalIdentity";
import { SignInError, methodDisabled } from "./errors";
import { isSwitchedOff, type AuthContext, type AuthMethodModule } from "./types";

const inputSchema = z.object({ ticket: z.string().min(40).max(64) });

/**
 * Auth.js Credentials `authorize` for SAML. The ACS route (app/api/auth/saml/[slug]/acs) has validated the IdP's
 * response and issued a one-time ticket; this uses it up (single use, two minutes) and signs the person in. It never
 * links to an existing account by email.
 */
export async function authorizeSaml(raw: unknown, request: Request, context: AuthContext) {
  if (isSwitchedOff(context, "saml")) throw methodDisabled();
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return null;
  if (await isIpBlocked(getClientIpFromHeaders(request.headers))) throw new SignInError("address_blocked");
  if (await isActionRateLimited("auth")) return null;

  // The ticket is usable only by the browser that started this sign-in (its flow cookie): a ticket from a link or a
  // pasted address, or one planted by an attacker, never signs another browser in.
  const flowToken = readFlowToken(request.headers.get("cookie"));
  if (!flowToken) {
    await auditSignInFailed("saml", "no_flow_cookie");
    throw new SignInError("saml_flow");
  }
  const identity = await consumeSamlTicket(parsed.data.ticket, flowToken);
  if (!identity) {
    await auditSignInFailed("saml", "bad_ticket");
    throw new SignInError("saml_failed");
  }
  const provider = context.saml.find((entry) => entry.id === identity.providerId);
  if (!provider) throw methodDisabled();
  try { (await cookies()).delete({ name: SAML_FLOW_COOKIE, path: "/api/auth" }); } catch { /* outside a request scope */ }
  try {
    return await signInExternalIdentity({ provider: samlProviderKey(provider.id), sub: identity.subject, email: identity.email, name: identity.name, failureCode: "saml_failed" });
  } catch (error) {
    if (error instanceof SignInError) await auditSignInFailed("saml", error.code);
    throw error;
  }
}

export const samlMethod: AuthMethodModule = (context) => ({
  providers: [
    Credentials({ id: "saml", name: "SAML", credentials: { ticket: { type: "text" } }, authorize: (raw, request) => authorizeSaml(raw, request, context) }),
  ],
});
