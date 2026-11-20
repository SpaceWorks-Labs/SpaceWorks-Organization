import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";

const m = vi.hoisted(() => ({
  admin: vi.fn(), limited: vi.fn(), audit: vi.fn(),
  oidcFind: vi.fn(), oidcCreate: vi.fn(), oidcUpdate: vi.fn(), oidcDelete: vi.fn(),
  samlFind: vi.fn(), samlCreate: vi.fn(), samlUpdate: vi.fn(),
}));
vi.mock("@/lib/permissions", () => ({ requireSuperAdmin: m.admin }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: m.limited }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: m.audit }));
vi.mock("@/lib/instanceConfigSecrets", () => ({ encryptInstanceConfigSecret: (value: string) => `enc:${value.length}` }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {
  oidcProvider: { findUnique: m.oidcFind, create: m.oidcCreate, update: m.oidcUpdate, deleteMany: m.oidcDelete },
  samlProvider: { findUnique: m.samlFind, create: m.samlCreate, update: m.samlUpdate, deleteMany: vi.fn(async () => ({ count: 1 })) },
} }));

import { saveOidcProvider } from "@/app/actions/oidc-providers";
import { saveSamlProvider, testSamlProvider } from "@/app/actions/saml-providers";
import { inspectIdpCertificate, testSamlConfig } from "@/lib/saml/diagnose";

const oidc = { slug: "work", name: "Work", issuer: "https://idp.example.test", clientId: "client", clientSecret: "very-secret-value", scopes: "openid email profile", enabled: true };
const pem = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "pem" }).toString();
const saml = { slug: "campus", name: "Campus", entityId: "https://idp.example.test/e", ssoUrl: "https://idp.example.test/sso", idpCertificate: pem, spEntityId: "", wantAssertionsSigned: true, enabled: false };

beforeEach(() => {
  vi.clearAllMocks();
  m.admin.mockResolvedValue({ user: { id: "admin_1" } });
  m.limited.mockResolvedValue(false);
  m.oidcFind.mockResolvedValue(null);
  m.oidcCreate.mockResolvedValue({ id: "o1" });
  m.samlFind.mockResolvedValue(null);
  m.samlCreate.mockResolvedValue({ id: "s1" });
});

describe("OIDC provider settings", () => {
  it("creates a provider with an encrypted secret and audits the slug, never the secret", async () => {
    expect(await saveOidcProvider(oidc)).toEqual({ ok: true });
    expect(m.oidcCreate.mock.calls[0][0].data).toMatchObject({ clientSecretEncrypted: "enc:17", enabled: true });
    expect(JSON.stringify(m.oidcCreate.mock.calls[0][0].data)).not.toContain("very-secret-value");
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "OIDC_PROVIDER_CREATED", metadata: { slug: "work", enabled: true } }));
    expect(JSON.stringify(m.audit.mock.calls)).not.toContain("very-secret-value");
  });
  it("needs a secret to create one, and keeps the stored secret when an edit leaves it blank, auditing field names only", async () => {
    expect(await saveOidcProvider({ ...oidc, clientSecret: "" })).toMatchObject({ ok: false });
    m.oidcFind.mockImplementation(async ({ where }: { where: { id?: string; slug?: string } }) => (where.id || where.slug ? { id: "o1", ...oidc, enabled: false, clientSecretEncrypted: "enc:old" } : null));
    expect(await saveOidcProvider({ ...oidc, id: "o1", clientSecret: "", name: "Renamed" })).toEqual({ ok: true });
    expect(m.oidcUpdate.mock.calls[0][0].data).not.toHaveProperty("clientSecretEncrypted");
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "OIDC_PROVIDER_UPDATED", metadata: { changed: "name,enabled" } }));
  });
  it("accepts only an https issuer and scopes that include openid", async () => {
    expect(await saveOidcProvider({ ...oidc, issuer: "http://idp.example.test" })).toMatchObject({ ok: false });
    expect(await saveOidcProvider({ ...oidc, scopes: "email profile" })).toMatchObject({ ok: false });
    expect(await saveOidcProvider({ ...oidc, slug: "Bad Slug!" })).toMatchObject({ ok: false });
    expect(m.oidcCreate).not.toHaveBeenCalled();
  });
  it("is for super admins only", async () => {
    m.admin.mockRejectedValue(new Error("forbidden"));
    await expect(saveOidcProvider(oidc)).rejects.toThrow("forbidden");
    expect(m.oidcCreate).not.toHaveBeenCalled();
  });
});

describe("SAML provider settings", () => {
  it("creates a provider, audits it, and refuses a private key or an unreadable certificate", async () => {
    expect(await saveSamlProvider(saml)).toEqual({ ok: true });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "SAML_PROVIDER_CREATED", metadata: { slug: "campus", enabled: false } }));
    expect(await saveSamlProvider({ ...saml, idpCertificate: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----" })).toMatchObject({ ok: false });
    expect(await saveSamlProvider({ ...saml, idpCertificate: "not a certificate" })).toMatchObject({ ok: false });
    expect(await saveSamlProvider({ ...saml, ssoUrl: "http://idp.example.test/sso" })).toMatchObject({ ok: false });
    expect(m.samlCreate).toHaveBeenCalledTimes(1);
  });
  it("tests that the certificate parses and, with a metadata address, that it names the same entity", async () => {
    expect(inspectIdpCertificate(pem)).toMatchObject({ ok: true });
    expect(inspectIdpCertificate("garbage")).toMatchObject({ ok: false });
    const metadata = (xml: string) => vi.fn(async () => new Response(xml)) as unknown as typeof fetch;
    const input = { idpCertificate: pem, ssoUrl: saml.ssoUrl, entityId: saml.entityId, metadataUrl: "https://idp.example.test/metadata" };
    expect(await testSamlConfig(input, metadata(`<EntityDescriptor entityID="${saml.entityId}"><SingleSignOnService Location="${saml.ssoUrl}"/></EntityDescriptor>`))).toMatchObject({ ok: true });
    expect(await testSamlConfig(input, metadata(`<EntityDescriptor entityID="https://other"/>`))).toMatchObject({ ok: false });
    expect(await testSamlConfig({ ...input, metadataUrl: "http://idp.example.test/m" }, metadata(""))).toMatchObject({ ok: false });
    expect(await testSamlProvider({ ssoUrl: saml.ssoUrl, entityId: saml.entityId, idpCertificate: pem })).toMatchObject({ ok: true, data: { ok: true } });
  });
});
