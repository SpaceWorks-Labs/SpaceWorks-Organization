import "server-only";

import { oidcProviderId } from "@/lib/oidc/providers";
import type { AuthMethodModule } from "./types";

/**
 * Generic OpenID Connect providers (operator level, any number). Auth.js does the redirects with issuer discovery and
 * PKCE, state and nonce, entirely on the server, so no browser-side connect-src is needed. Never
 * `allowDangerousEmailAccountLinking`: an OIDC identity never links to an existing account by email
 * (lib/signInRules.ts refuses with `link_from_account`).
 */
export const oidcMethod: AuthMethodModule = ({ oidc, available }) => ({
  providers: available.includes("oidc")
    ? oidc.map((provider) => ({
      id: oidcProviderId(provider.id),
      name: provider.name,
      type: "oidc" as const,
      issuer: provider.issuer,
      clientId: provider.clientId,
      clientSecret: provider.clientSecret,
      checks: ["pkce", "state", "nonce"] as ("pkce" | "state" | "nonce")[],
      authorization: { params: { scope: provider.scopes } },
    }))
    : [],
});
