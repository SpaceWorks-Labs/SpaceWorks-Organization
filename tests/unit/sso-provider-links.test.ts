import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";

const m = vi.hoisted(() => ({
  admin: vi.fn(), limited: vi.fn(), audit: vi.fn(), accountCount: vi.fn(), accountDelete: vi.fn(),
  oidcFind: vi.fn(), oidcUpdate: vi.fn(), oidcDelete: vi.fn(), samlFind: vi.fn(), samlUpdate: vi.fn(), samlDelete: vi.fn(),
}));
vi.mock("@/lib/permissions", () => ({ requireSuperAdmin: m.admin }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: m.limited }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: m.audit }));
vi.mock("@/lib/instanceConfigSecrets", () => ({ encryptInstanceConfigSecret: (value: string) => `enc:${value.length}` }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => {
  const prisma = {
    account: { count: m.accountCount, deleteMany: m.accountDelete },
    oidcProvider: { findUnique: m.oidcFind, update: m.oidcUpdate, deleteMany: m.oidcDelete },
    samlProvider: { findUnique: m.samlFind, update: m.samlUpdate, deleteMany: m.samlDelete },
    $transaction: async (run: (tx: unknown) => unknown) => run(prisma),
  };
  return { prisma };
});

import { deleteOidcProvider, saveOidcProvider } from "@/app/actions/oidc-providers";
import { deleteSamlProvider, saveSamlProvider } from "@/app/actions/saml-providers";
import { oidcProviderId } from "@/lib/oidc/providers";
import { samlProviderKey } from "@/lib/saml/keys";
import { providerAvailable } from "@/lib/authMethods/workingMethods";

const pem = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "pem" }).toString();
const oidcRow = { id: "o1", slug: "work", name: "Work", issuer: "https://idp.example.test", clientId: "c", scopes: "openid", enabled: true, clientSecretEncrypted: "enc:1" };
const oidcForm = { id: "o1", slug: "work", name: "Work", issuer: "https://idp.example.test", clientId: "c", clientSecret: "", scopes: "openid", enabled: true };
const samlRow = { id: "s1", slug: "campus", name: "Campus", entityId: "https://idp.example.test/e", ssoUrl: "https://idp.example.test/sso", idpCertificate: pem.trim(), spEntityId: null, wantAssertionsSigned: true, enabled: true };
const samlForm = { ...samlRow, spEntityId: "", idpCertificate: pem };

beforeEach(() => {
  vi.clearAllMocks();
  m.admin.mockResolvedValue({ user: { id: "admin_1" } });
  m.limited.mockResolvedValue(false);
  m.oidcFind.mockImplementation(async ({ where }: { where: { id?: string } }) => (where.id ? oidcRow : null));
  m.samlFind.mockImplementation(async ({ where }: { where: { id?: string } }) => (where.id ? samlRow : null));
  m.accountCount.mockResolvedValue(0);
  m.accountDelete.mockResolvedValue({ count: 3 });
  m.oidcDelete.mockResolvedValue({ count: 1 });
  m.samlDelete.mockResolvedValue({ count: 1 });
});

describe("provider links are keyed by the provider's immutable id", () => {
  it("uses oidc:<id> and saml:<id>, never the editable slug", () => {
    expect(oidcProviderId("o1")).toBe("oidc-o1");
    expect(samlProviderKey("s1")).toBe("saml-s1");
  });
  it("a replaced provider (new id, same slug) does not make an old link usable", () => {
    const context = { available: ["oidc", "saml"], oidc: [{ id: "o2", slug: "work" }], saml: [{ id: "s2", slug: "campus" }] } as never;
    expect(providerAvailable("oidc-o1", context)).toBe(false);
    expect(providerAvailable("saml-s1", context)).toBe(false);
    expect(providerAvailable("oidc-o2", context)).toBe(true);
    expect(providerAvailable("saml-s2", context)).toBe(true);
  });
});

describe("deleting a provider", () => {
  it("removes its account links in the same transaction and audits the count", async () => {
    expect(await deleteOidcProvider("o1")).toEqual({ ok: true });
    expect(m.accountDelete).toHaveBeenCalledWith({ where: { provider: "oidc-o1" } });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "OIDC_PROVIDER_REMOVED", metadata: { linksRemoved: 3 } }));
    expect(await deleteSamlProvider("s1")).toEqual({ ok: true });
    expect(m.accountDelete).toHaveBeenCalledWith({ where: { provider: "saml-s1" } });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "SAML_PROVIDER_REMOVED", metadata: { linksRemoved: 3 } }));
  });
});

describe("changing a provider's identity while accounts are linked", () => {
  it("refuses a different OIDC issuer, but allows other edits", async () => {
    m.accountCount.mockResolvedValue(2);
    expect(await saveOidcProvider({ ...oidcForm, issuer: "https://other.example.test" })).toMatchObject({ ok: false, error: expect.stringContaining("Remove the linked accounts first") });
    expect(m.accountCount).toHaveBeenCalledWith({ where: { provider: "oidc-o1" } });
    expect(m.oidcUpdate).not.toHaveBeenCalled();
    expect(await saveOidcProvider({ ...oidcForm, name: "Renamed" })).toEqual({ ok: true });
  });
  it("refuses a different SAML entity id or sign-on address, but allows other edits", async () => {
    m.accountCount.mockResolvedValue(1);
    expect(await saveSamlProvider({ ...samlForm, entityId: "https://other.example.test/e" })).toMatchObject({ ok: false });
    expect(await saveSamlProvider({ ...samlForm, ssoUrl: "https://other.example.test/sso" })).toMatchObject({ ok: false });
    expect(m.samlUpdate).not.toHaveBeenCalled();
    expect(await saveSamlProvider({ ...samlForm, wantAssertionsSigned: false })).toEqual({ ok: true });
  });
  it("allows the change when nobody is linked", async () => {
    expect(await saveOidcProvider({ ...oidcForm, issuer: "https://other.example.test" })).toEqual({ ok: true });
  });
});
