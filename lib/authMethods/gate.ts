import "server-only";

import { NextResponse } from "next/server";
import { loadLoginMethods } from "@/lib/loginMethods";
import { isOidcProviderId, oidcProviderId } from "@/lib/oidc/providers";
import type { LoginMethod } from "@/lib/loginMethodsCore";

const OAUTH_ROUTE = /^\/api\/auth\/(?:signin|callback)\/([^/]+)$/;

/** The method behind an Auth.js OAuth or OIDC provider id, or null for ids whose own authorize refuses (credentials types). */
function redirectMethod(id: string): LoginMethod | null {
  if (id === "google" || id === "apple" || id === "github") return id;
  return isOidcProviderId(id) ? "oidc" : null;
}

function publicUrl(path: string, requestUrl: string) {
  return new URL(path, process.env.NEXT_PUBLIC_BASE_URL || requestUrl);
}

/** The refusal for any signed-in-with-a-redirect URL (the start of a sign-in, or its callback) of a method that is off. */
function methodDisabledResponse(request: Request) {
  const target = publicUrl("/login?error=method_disabled", request.url);
  // Auth.js's own client asks for the address as JSON; everything else follows the redirect.
  if (request.headers.get("x-auth-return-redirect") === "1") return NextResponse.json({ url: target.href });
  return NextResponse.redirect(target, 302);
}

/**
 * "Off means gone" for OAuth and OIDC: a request to a provider's start or callback URL while its method is off (or
 * the OIDC provider is disabled or unknown) is answered with `/login?error=method_disabled`. Returns null to continue.
 */
export async function gateDisabledMethod(request: Request): Promise<Response | null> {
  const match = OAUTH_ROUTE.exec(new URL(request.url).pathname);
  if (!match) return null;
  const id = decodeURIComponent(match[1]);
  const method = redirectMethod(id);
  if (!method) return null;
  const { available, oidc } = await loadLoginMethods();
  const on = available.includes(method) && (method !== "oidc" || oidc.some((provider) => oidcProviderId(provider.id) === id));
  return on ? null : methodDisabledResponse(request);
}
