import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), account: vi.fn(), accounts: vi.fn(), mayCreate: vi.fn(), boundOther: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: mocks.user }, account: { findUnique: mocks.account, findMany: mocks.accounts } } }));
vi.mock("@/lib/inviteSignup", () => ({ mayCreateAccount: mocks.mayCreate, inviteBoundToOtherEmail: mocks.boundOther }));
vi.mock("@/lib/instanceConfigSecrets", () => ({ decryptInstanceConfigSecret: (value: string) => value.replace("enc:", "") }));

import { identityRefusal } from "@/lib/signInRules";
import { providerVerifiedEmail } from "@/lib/oauthProviders";
import { testOidcConnection } from "@/lib/oidc/discovery";

const email = "person@example.test";
const oidc = (options: { linked?: boolean; existing?: object | null } = {}) => {
  mocks.account.mockResolvedValue(options.linked ? { id: "acc_1", user: { isSuperAdmin: false } } : null);
  mocks.user.mockResolvedValue(options.existing ?? null);
  return identityRefusal(email, "oidc-work", "sub-1", { linkByEmail: false });
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mayCreate.mockResolvedValue(true);
  mocks.boundOther.mockResolvedValue(false);
});

describe("OIDC sign-in rules", () => {
  it("never links an existing account by email: link_from_account", async () => {
    expect(await oidc({ existing: { passwordHash: "hash", emailVerified: new Date(), isSuperAdmin: false } })).toBe("link_from_account");
  });
  it("signs in an account already linked to this provider and subject", async () => {
    expect(await oidc({ linked: true, existing: { passwordHash: "hash", emailVerified: new Date(), isSuperAdmin: false } })).toBeNull();
  });
  it("creates a new account only through the creation gate", async () => {
    expect(await oidc()).toBeNull();
    expect(mocks.mayCreate).toHaveBeenCalledWith(email);
    mocks.mayCreate.mockResolvedValue(false);
    expect(await oidc()).toBe("account_creation_disabled");
    mocks.boundOther.mockResolvedValue(true);
    expect(await oidc()).toBe("invite_email_mismatch");
  });
  it("refuses a super admin, by email and by linked account", async () => {
    expect(await oidc({ existing: { passwordHash: "hash", emailVerified: new Date(), isSuperAdmin: true } })).toBe("super_admin_password_only");
    mocks.account.mockResolvedValue({ id: "acc_1", user: { isSuperAdmin: true } });
    mocks.user.mockResolvedValue(null);
    expect(await identityRefusal(email, "oidc-work", "sub-1", { linkByEmail: false })).toBe("super_admin_password_only");
  });
  it("still lets Google, Apple and GitHub link by verified email (the default)", async () => {
    mocks.account.mockResolvedValue(null);
    mocks.user.mockResolvedValue({ passwordHash: "hash", emailVerified: new Date(), isSuperAdmin: false });
    expect(await identityRefusal(email, "google", "g-1")).toBeNull();
  });
  describe("pre-registered accounts", () => {
    const passwordless = { id: "u1", passwordHash: null, emailVerified: new Date(), isSuperAdmin: false };
    const link = (providers: string[], provider = "google") => {
      mocks.account.mockResolvedValue(null);
      mocks.user.mockResolvedValue(passwordless);
      mocks.accounts.mockResolvedValue(providers.map((name) => ({ provider: name })));
      return identityRefusal(email, provider, "g-1");
    };
    it("refuses Google, Apple and GitHub linking into a passwordless account that only has SAML or bridge identities", async () => {
      for (const provider of ["google", "apple", "github"]) {
        expect(await link(["saml-s1"], provider)).toBe("link_from_account");
        expect(await link(["supabase", "firebase"], provider)).toBe("link_from_account");
      }
    });
    it("still links when the account has a password, or any other kind of identity, or none", async () => {
      expect(await link(["saml-s1", "github"])).toBeNull();
      expect(await link([])).toBeNull();
      mocks.user.mockResolvedValue({ ...passwordless, passwordHash: "hash" });
      expect(await identityRefusal(email, "google", "g-1")).toBeNull();
    });
  });
});

describe("OIDC verified email", () => {
  it("requires the email_verified claim to be true", async () => {
    expect(await providerVerifiedEmail("oidc-work", { email_verified: true }, undefined, email)).toBe(true);
    expect(await providerVerifiedEmail("oidc-work", { email_verified: "true" }, undefined, email)).toBe(true);
    expect(await providerVerifiedEmail("oidc-work", { email_verified: false }, undefined, email)).toBe(false);
    expect(await providerVerifiedEmail("oidc-work", { email: email }, undefined, email)).toBe(false);
  });
});

describe("OIDC test connection", () => {
  const issuer = "https://idp.example.test/realm";
  const doc = (patch: object = {}) => ({ issuer, authorization_endpoint: `${issuer}/auth`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/certs`, ...patch });
  const answer = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("fetches the discovery document over https and accepts a matching issuer", async () => {
    const fetchImpl = answer(doc());
    expect(await testOidcConnection(issuer, fetchImpl)).toMatchObject({ ok: true });
    expect(vi.mocked(fetchImpl).mock.calls[0][0]).toBe(`${issuer}/.well-known/openid-configuration`);
  });
  it("refuses a mismatched issuer, a missing endpoint, a bad status, http and an unreachable host", async () => {
    expect(await testOidcConnection(issuer, answer(doc({ issuer: "https://other.example.test" })))).toMatchObject({ ok: false, error: expect.stringContaining("doesn't match") });
    expect(await testOidcConnection(issuer, answer(doc({ token_endpoint: "http://idp.example.test/token" })))).toMatchObject({ ok: false });
    expect(await testOidcConnection(issuer, answer({}, 404))).toMatchObject({ ok: false });
    expect(await testOidcConnection("http://idp.example.test", answer(doc()))).toMatchObject({ ok: false, error: expect.stringContaining("https") });
    expect(await testOidcConnection(issuer, vi.fn(async () => { throw new Error("down"); }) as unknown as typeof fetch)).toMatchObject({ ok: false });
  });
});
