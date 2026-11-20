import "server-only";

import { X509Certificate, createPublicKey } from "crypto";
import { assertPublicHost, PrivateHostError } from "@/lib/net/publicHost";

export type SamlTestResult = { ok: true; notes: string[] } | { ok: false; error: string };

/** A certificate or public key as a PEM block: bare base64 gets its BEGIN and END lines. */
export function normaliseIdpCertificate(value: string) {
  const text = value.trim();
  if (text.includes("-----BEGIN")) return text;
  const body = text.replace(/\s+/g, "");
  return `-----BEGIN CERTIFICATE-----\n${body.match(/.{1,64}/g)?.join("\n") ?? ""}\n-----END CERTIFICATE-----`;
}

/** Whether the text is a parseable X.509 certificate or public key (the IdP's public part only; a private key is refused). */
export function inspectIdpCertificate(value: string): { ok: true; note: string } | { ok: false; error: string } {
  const pem = normaliseIdpCertificate(value);
  if (/PRIVATE KEY/.test(pem)) return { ok: false, error: "That is a private key. Paste only the identity provider's public certificate." };
  try {
    const certificate = new X509Certificate(pem);
    const expiry = new Date(certificate.validTo);
    if (Number.isFinite(expiry.getTime()) && expiry < new Date()) return { ok: false, error: `The certificate expired on ${expiry.toISOString().slice(0, 10)}.` };
    return { ok: true, note: `Certificate valid until ${expiry.toISOString().slice(0, 10)}.` };
  } catch {
    try {
      createPublicKey(pem);
      return { ok: true, note: "Public key read." };
    } catch {
      return { ok: false, error: "The certificate couldn't be read. Paste it as PEM, including its BEGIN and END lines." };
    }
  }
}

const isHttps = (value: string) => {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
};

/**
 * "Test" for a SAML provider: the certificate parses and is current, the sign-on address is https, and, if a metadata
 * address is given, it can be fetched over TLS and names the same entity id and sign-on address. The fetch is injectable for tests.
 */
export async function testSamlConfig(input: { idpCertificate: string; ssoUrl: string; entityId: string; metadataUrl?: string }, fetchImpl: typeof fetch = fetch): Promise<SamlTestResult> {
  if (!isHttps(input.ssoUrl)) return { ok: false, error: "The sign-on address must start with https://." };
  const cert = inspectIdpCertificate(input.idpCertificate);
  if (!cert.ok) return cert;
  const notes = [cert.note];
  if (input.metadataUrl) {
    if (!isHttps(input.metadataUrl)) return { ok: false, error: "The metadata address must start with https://." };
    let xml: string;
    try {
      await assertPublicHost(new URL(input.metadataUrl).hostname);
    } catch (error) {
      if (error instanceof PrivateHostError) return { ok: false, error: error.message };
      return { ok: false, error: "The metadata address isn't valid." };
    }
    try {
      const response = await fetchImpl(input.metadataUrl, { headers: { Accept: "application/samlmetadata+xml, application/xml, text/xml" }, redirect: "error", signal: AbortSignal.timeout(8_000) });
      if (!response.ok) return { ok: false, error: `The metadata address answered ${response.status}.` };
      xml = (await response.text()).slice(0, 512 * 1024);
    } catch {
      return { ok: false, error: "The metadata couldn't be fetched over https." };
    }
    if (!/EntityDescriptor/.test(xml)) return { ok: false, error: "That address didn't return SAML metadata." };
    if (!xml.includes(input.entityId)) return { ok: false, error: "The metadata names a different entity id from the one entered." };
    if (!xml.includes(input.ssoUrl)) notes.push("The metadata doesn't list the sign-on address entered; check it.");
    else notes.push("Metadata matches the entity id and sign-on address.");
  }
  return { ok: true, notes };
}
