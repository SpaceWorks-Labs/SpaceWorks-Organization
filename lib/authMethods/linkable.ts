import "server-only";

import { loadLoginMethods } from "@/lib/loginMethods";
import { oidcProviderId } from "@/lib/oidc/providers";
import { samlProviderKey } from "@/lib/saml/keys";
import { providerAvailable } from "./workingMethods";

/**
 * An outside identity a signed-in person can add to their account. `kind` says how the browser starts it: Auth.js
 * `signIn(provider)` for OAuth and OpenID Connect, a redirect to the SAML start URL, or the bridge's own page.
 * Apple is not offered: it answers with a cross-site form POST, which drops the same-site session cookie linking needs.
 */
export type LinkableMethod = { provider: string; label: string; kind: "oauth" | "saml" | "bridge"; href: string | null };

export async function listLinkableMethods(): Promise<LinkableMethod[]> {
  const context = await loadLoginMethods();
  const found: LinkableMethod[] = [];
  if (providerAvailable("google", context)) found.push({ provider: "google", label: "Google", kind: "oauth", href: null });
  if (providerAvailable("github", context)) found.push({ provider: "github", label: "GitHub", kind: "oauth", href: null });
  for (const entry of context.oidc) {
    const provider = oidcProviderId(entry.id);
    if (providerAvailable(provider, context)) found.push({ provider, label: entry.name, kind: "oauth", href: null });
  }
  for (const entry of context.saml) {
    const provider = samlProviderKey(entry.id);
    if (providerAvailable(provider, context)) found.push({ provider, label: entry.name, kind: "saml", href: `/api/auth/saml/${entry.slug}/login?callbackUrl=%2Faccount%2Fsecurity` });
  }
  for (const provider of ["supabase", "firebase"] as const) {
    if (providerAvailable(provider, context)) found.push({ provider, label: provider === "supabase" ? "Supabase" : "Firebase", kind: "bridge", href: `/login/bridge/${provider}?callbackUrl=%2Faccount%2Fsecurity` });
  }
  return found;
}

/** A linked identity's display name: the provider's configured name when it still exists, else a readable fallback. */
export async function linkedProviderLabels() {
  const context = await loadLoginMethods();
  const names = new Map<string, string>([["google", "Google"], ["apple", "Apple"], ["github", "GitHub"], ["supabase", "Supabase"], ["firebase", "Firebase"]]);
  for (const entry of context.oidc) names.set(oidcProviderId(entry.id), entry.name);
  for (const entry of context.saml) names.set(samlProviderKey(entry.id), entry.name);
  return { names, context };
}
