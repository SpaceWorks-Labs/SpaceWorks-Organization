import "server-only";

export type OidcTestResult = { ok: true; endpoints: string[] } | { ok: false; error: string };

const REQUIRED = ["authorization_endpoint", "token_endpoint", "jwks_uri"] as const;
const MAX_BYTES = 256 * 1024;

/** The discovery document address for an issuer (RFC 8414 / OpenID Connect Discovery). */
export const discoveryUrl = (issuer: string) => `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;

/**
 * "Test connection": fetch the issuer's discovery document over TLS and check that the issuer it names is exactly the
 * one configured (a mismatch makes every sign-in fail) and that the endpoints sign-in needs are https. Never sends a
 * secret. The fetch is injectable for tests.
 */
export async function testOidcConnection(issuer: string, fetchImpl: typeof fetch = fetch): Promise<OidcTestResult> {
  let url: URL;
  try {
    url = new URL(issuer);
  } catch {
    return { ok: false, error: "The issuer isn't a valid address." };
  }
  if (url.protocol !== "https:") return { ok: false, error: "The issuer must start with https://." };
  let document: Record<string, unknown>;
  try {
    const response = await fetchImpl(discoveryUrl(issuer), { headers: { Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return { ok: false, error: `The issuer answered ${response.status} for its discovery document.` };
    const text = await response.text();
    if (text.length > MAX_BYTES) return { ok: false, error: "The discovery document is too large." };
    document = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "The discovery document couldn't be fetched over https. Check the issuer address." };
  }
  if (document.issuer !== issuer) return { ok: false, error: "The issuer in the discovery document doesn't match the one entered. Use it exactly, including any trailing slash." };
  for (const key of REQUIRED) {
    const value = document[key];
    if (typeof value !== "string" || !value.startsWith("https://")) return { ok: false, error: `The discovery document has no https ${key}.` };
  }
  return { ok: true, endpoints: REQUIRED.map((key) => String(document[key])) };
}
