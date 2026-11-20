import crypto from "crypto";
import { SignedXml } from "xml-crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.AUTH_SECRET = "s".repeat(48);
process.env.NEXT_PUBLIC_BASE_URL = "https://org.example.test";

/** node-saml's request-id store, in memory (the real one is the database; its atomic delete is covered by the integration test). */
const cache = vi.hoisted(() => ({ rows: new Map<string, string>() }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/saml/state", async (original) => ({
  ...(await original<typeof import("@/lib/saml/state")>()),
  samlCacheProvider: () => ({
    saveAsync: async (key: string, value: string) => { cache.rows.set(key, value); return { value, createdAt: Date.now() }; },
    getAsync: async (key: string) => cache.rows.get(key) ?? null,
    removeAsync: async (key: string | null) => { if (key) cache.rows.delete(key); return key; },
    consumeAsync: async (key: string) => { const value = cache.rows.get(key) ?? null; cache.rows.delete(key); return value; },
    saveIfAbsentAsync: async (key: string) => { if (cache.rows.has(`a:${key}`)) return false; cache.rows.set(`a:${key}`, "1"); return true; },
  }),
}));

import { readSamlResponse, samlUrls, startSamlLogin, SamlRefusal } from "@/lib/saml/service";
import { readRelayState, signRelayState } from "@/lib/saml/state";

const idp = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const stranger = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = (key: crypto.KeyObject) => key.export({ type: "spki", format: "pem" }).toString();
const provider = { id: "prov_1", slug: "campus", name: "Campus", entityId: "https://idp.example.test/entity", ssoUrl: "https://idp.example.test/sso", idpCertificate: pem(idp.publicKey), spEntityId: null, wantAssertionsSigned: true };
const acs = samlUrls("campus").acs;
const audience = samlUrls("campus").metadata;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

/** An IdP's response, with the assertion signed by `signWith`. */
function respond(requestId: string, options: { signWith?: crypto.KeyObject; audience?: string; recipient?: string; notOnOrAfter?: string; issuer?: string; email?: string; unsigned?: boolean } = {}) {
  const xml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_r${crypto.randomUUID()}" Version="2.0" IssueInstant="${iso(0)}" Destination="${acs}" InResponseTo="${requestId}"><saml:Issuer>${options.issuer ?? provider.entityId}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status><saml:Assertion ID="_a${crypto.randomUUID()}" Version="2.0" IssueInstant="${iso(0)}"><saml:Issuer>${options.issuer ?? provider.entityId}</saml:Issuer><saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${options.email ?? "Person@Example.test"}</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="${options.notOnOrAfter ?? iso(300_000)}" Recipient="${options.recipient ?? acs}" InResponseTo="${requestId}"/></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="${iso(-60_000)}" NotOnOrAfter="${options.notOnOrAfter ?? iso(300_000)}"><saml:AudienceRestriction><saml:Audience>${options.audience ?? audience}</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AttributeStatement><saml:Attribute Name="displayName"><saml:AttributeValue>Pat Person</saml:AttributeValue></saml:Attribute></saml:AttributeStatement><saml:AuthnStatement AuthnInstant="${iso(0)}" SessionIndex="_s1"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement></saml:Assertion></samlp:Response>`;
  if (options.unsigned) return Buffer.from(xml).toString("base64");
  const sig = new SignedXml({ privateKey: (options.signWith ?? idp.privateKey).export({ type: "pkcs8", format: "pem" }).toString(), signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256", canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#" });
  sig.addReference({ xpath: "//*[local-name(.)='Assertion']", transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", "http://www.w3.org/2001/10/xml-exc-c14n#"], digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256" });
  sig.computeSignature(xml, { location: { reference: "//*[local-name(.)='Assertion']/*[local-name(.)='Issuer']", action: "after" } });
  return Buffer.from(sig.getSignedXml()).toString("base64");
}

/** Start a login as the browser would and return the AuthnRequest id the library remembered. */
async function begin(callbackUrl = "/dashboard") {
  const url = new URL(await startSamlLogin(provider, callbackUrl, "flow-hash"));
  expect(url.origin + url.pathname).toBe(provider.ssoUrl);
  expect(url.searchParams.get("SAMLRequest")).toBeTruthy();
  const [requestId] = [...cache.rows.keys()].filter((key) => !key.startsWith("a:")).slice(-1);
  return { requestId, relayState: url.searchParams.get("RelayState") ?? "" };
}
const refusal = (promise: Promise<unknown>) => promise.then(() => "accepted", (error: unknown) => (error instanceof SamlRefusal ? error.reason : "other"));

beforeEach(() => cache.rows.clear());

describe("SAML response validation", () => {
  it("accepts a correctly signed response to our request and reads the email from the NameID", async () => {
    const { requestId, relayState } = await begin("/dashboard/acme");
    const result = await readSamlResponse(provider, { SAMLResponse: respond(requestId), RelayState: relayState });
    expect(result.identity).toEqual({ email: "person@example.test", name: "Pat Person", subject: "Person@Example.test" });
    expect(result.callbackUrl).toBe("/dashboard/acme");
  });
  it("uses a request id once: replaying the same response is refused", async () => {
    const { requestId } = await begin();
    const response = respond(requestId);
    await readSamlResponse(provider, { SAMLResponse: response });
    expect(await refusal(readSamlResponse(provider, { SAMLResponse: response }))).toBe("invalid_response");
  });
  it("refuses a response that answers a request we never made (InResponseTo)", async () => {
    await begin();
    expect(await refusal(readSamlResponse(provider, { SAMLResponse: respond("_unknown-request") }))).toBe("invalid_response");
  });
  it("refuses an expired assertion", async () => {
    const { requestId } = await begin();
    expect(await refusal(readSamlResponse(provider, { SAMLResponse: respond(requestId, { notOnOrAfter: iso(-3_600_000) }) }))).toBe("invalid_response");
  });
  it("refuses another audience", async () => {
    const { requestId } = await begin();
    expect(await refusal(readSamlResponse(provider, { SAMLResponse: respond(requestId, { audience: "https://someone-else.example.test" }) }))).toBe("invalid_response");
  });
  it("refuses a recipient that is not our response address", async () => {
    const { requestId } = await begin();
    expect(await refusal(readSamlResponse(provider, { SAMLResponse: respond(requestId, { recipient: "https://evil.example.test/acs" }) }))).toBe("wrong_recipient");
  });
  it("refuses an assertion signed by another key, an unsigned one and another issuer", async () => {
    let { requestId } = await begin();
    expect(await refusal(readSamlResponse(provider, { SAMLResponse: respond(requestId, { signWith: stranger.privateKey }) }))).toBe("invalid_response");
    ({ requestId } = await begin());
    expect(await refusal(readSamlResponse(provider, { SAMLResponse: respond(requestId, { unsigned: true }) }))).toBe("invalid_response");
    ({ requestId } = await begin());
    expect(await refusal(readSamlResponse(provider, { SAMLResponse: respond(requestId, { issuer: "https://other-idp.example.test" }) }))).toBe("invalid_response");
  });
  it("refuses a NameID that is not an email address when no mail attribute exists", async () => {
    const { requestId } = await begin();
    expect(await refusal(readSamlResponse(provider, { SAMLResponse: respond(requestId, { email: "not-an-email" }) }))).toBe("no_email");
  });
  it("refuses a missing response", async () => {
    expect(await refusal(readSamlResponse(provider, {}))).toBe("no_response");
  });
});

describe("SAML relay state", () => {
  it("round-trips a same-site path and falls back to the dashboard for a forged, expired or off-site one", () => {
    expect(readRelayState(signRelayState("/dashboard/x?y=1"))).toBe("/dashboard/x?y=1");
    expect(readRelayState(signRelayState("https://evil.example.test/"))).toBe("/dashboard");
    expect(readRelayState(signRelayState("//evil.example.test"))).toBe("/dashboard");
    const [body, mac] = signRelayState("/dashboard/x").split(".");
    expect(readRelayState(`${Buffer.from(JSON.stringify({ c: "/admin", e: Date.now() + 1e6 })).toString("base64url")}.${mac}`)).toBe("/dashboard");
    expect(readRelayState(`${body}.AAAA`)).toBe("/dashboard");
    expect(readRelayState(signRelayState("/dashboard/x", Date.now() - 3_600_000))).toBe("/dashboard");
    expect(readRelayState(null)).toBe("/dashboard");
  });
});
