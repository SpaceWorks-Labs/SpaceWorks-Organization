import "server-only";

import { SAML, ValidateInResponseTo, type Profile } from "@node-saml/node-saml";
import type { SamlProviderConfig } from "./providers";
import { readRelayState, samlCacheProvider, signRelayState, type SamlFlowBinding, type SamlIdentity } from "./state";

const EMAIL_FORMAT = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress";
const EMAIL_ATTRIBUTES = ["email", "mail", "emailAddress", "urn:oid:0.9.2342.19200300.100.1.3", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"];
const NAME_ATTRIBUTES = ["displayName", "name", "cn", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"];

/** Why a response was refused. The login page shows `saml_failed` for all of them; the code is for the audit row. */
export class SamlRefusal extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

function origin() {
  return (process.env.NEXT_PUBLIC_BASE_URL || process.env.AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** The three URLs a provider needs: where the IdP posts to, our metadata, and where a person starts. */
export function samlUrls(slug: string) {
  const base = `${origin()}/api/auth/saml/${encodeURIComponent(slug)}`;
  return { acs: `${base}/acs`, metadata: `${base}/metadata`, login: `${base}/login` };
}

export const samlEntityId = (provider: Pick<SamlProviderConfig, "slug" | "spEntityId">) => provider.spEntityId || samlUrls(provider.slug).metadata;

/** A node-saml instance for one provider: signature, audience, time window and InResponseTo are checked by the library. */
export function samlFor(provider: SamlProviderConfig, flow: SamlFlowBinding = {}) {
  const urls = samlUrls(provider.slug);
  return new SAML({
    callbackUrl: urls.acs,
    entryPoint: provider.ssoUrl,
    issuer: samlEntityId(provider),
    audience: samlEntityId(provider),
    idpIssuer: provider.entityId,
    idpCert: provider.idpCertificate,
    wantAssertionsSigned: provider.wantAssertionsSigned,
    wantAuthnResponseSigned: false,
    validateInResponseTo: ValidateInResponseTo.always,
    requestIdExpirationPeriodMs: 10 * 60_000,
    cacheProvider: samlCacheProvider(provider.id, flow),
    rejectReplayedAssertions: true,
    acceptedClockSkewMs: 60_000,
    identifierFormat: EMAIL_FORMAT,
    disableRequestedAuthnContext: true,
    signatureAlgorithm: "sha256",
  });
}

/** The IdP URL to send the browser to, with an AuthnRequest whose id is remembered for the response. */
export async function startSamlLogin(provider: SamlProviderConfig, callbackUrl: string, flowHash: string) {
  return samlFor(provider, { hash: flowHash }).getAuthorizeUrlAsync(signRelayState(callbackUrl), undefined, {});
}

const sameUrl = (a: string, b: string) => {
  try { return new URL(a).href === new URL(b).href; } catch { return false; }
};

/** Every Recipient the assertion's bearer confirmations name. */
function recipients(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((item) => recipients(item, found));
  else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "Recipient" && typeof value === "string") found.push(value);
      else recipients(value, found);
    }
  }
  return found;
}

function attribute(profile: Profile, names: string[]) {
  for (const name of names) {
    const value = profile[name];
    const text = Array.isArray(value) ? value[0] : value;
    if (typeof text === "string" && text.trim()) return text.trim();
  }
  return null;
}

/** The email and name an assertion carries: the NameID when it is an email address, else a mail attribute. */
export function identityFromProfile(profile: Profile): SamlIdentity {
  const nameId = profile.nameID?.trim();
  const email = (profile.nameIDFormat === EMAIL_FORMAT && nameId?.includes("@") ? nameId : attribute(profile, EMAIL_ATTRIBUTES))?.toLowerCase() ?? "";
  if (!nameId) throw new SamlRefusal("no_subject");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new SamlRefusal("no_email");
  return { email, name: attribute(profile, NAME_ATTRIBUTES)?.slice(0, 200) ?? null, subject: nameId.slice(0, 256) };
}

/**
 * Validate a posted response: signature, issuer, audience, NotBefore/NotOnOrAfter, InResponseTo against a stored
 * request id (single use) and, here, the Recipient. Returns the identity and the callback path from RelayState.
 */
export async function readSamlResponse(provider: SamlProviderConfig, form: { SAMLResponse?: string; RelayState?: string }) {
  if (!form.SAMLResponse) throw new SamlRefusal("no_response");
  let profile: Profile | null;
  let flow: string | null = null;
  try {
    ({ profile } = await samlFor(provider, { onConsume: (hash) => { flow = hash; } }).validatePostResponseAsync({ SAMLResponse: form.SAMLResponse }));
  } catch {
    throw new SamlRefusal("invalid_response");
  }
  if (!profile) throw new SamlRefusal("invalid_response");
  const named = recipients(profile.getAssertion?.() ?? {});
  if (!named.some((recipient) => sameUrl(recipient, samlUrls(provider.slug).acs))) throw new SamlRefusal("wrong_recipient");
  return { identity: identityFromProfile(profile), callbackUrl: readRelayState(form.RelayState), flow };
}

/** Our service-provider metadata, for the IdP's administrator. */
export function samlMetadata(provider: SamlProviderConfig) {
  return samlFor(provider).generateServiceProviderMetadata(null, null);
}
