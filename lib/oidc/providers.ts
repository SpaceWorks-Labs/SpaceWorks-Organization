import "server-only";

import { prisma } from "@/lib/db";
import { decryptInstanceConfigSecret } from "@/lib/instanceConfigSecrets";

export type OidcProviderConfig = {
  id: string;
  slug: string;
  name: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
};

/** Account.provider for an OIDC link and the Auth.js provider id: the provider row's immutable id, never its editable slug. */
export const OIDC_PREFIX = "oidc-";
export const oidcProviderId = (id: string) => `${OIDC_PREFIX}${id}`;
export const isOidcProviderId = (id: string) => id.startsWith(OIDC_PREFIX) && id.length > OIDC_PREFIX.length;

/** Enabled operator-level OpenID Connect providers with their secrets decrypted (server only; never send to a browser). */
export async function listEnabledOidcProviders(): Promise<OidcProviderConfig[]> {
  const rows = await prisma.oidcProvider.findMany({ where: { enabled: true }, orderBy: { name: "asc" } });
  const providers: OidcProviderConfig[] = [];
  for (const row of rows) {
    try {
      providers.push({ id: row.id, slug: row.slug, name: row.name, issuer: row.issuer, clientId: row.clientId, clientSecret: decryptInstanceConfigSecret(row.clientSecretEncrypted), scopes: row.scopes });
    } catch {
      // An unreadable secret leaves that provider off rather than breaking every sign-in.
      console.error("[auth] An OpenID Connect provider's secret could not be read");
    }
  }
  return providers;
}
