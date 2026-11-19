import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.AUTH_SECRET = "c".repeat(48);

const state = vi.hoisted(() => ({ signups: true }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "198.51.100.78", "user-agent": "Vitest" }),
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}));
vi.mock("next-auth", () => ({ CredentialsSignin: class extends Error { code = "credentials"; } }));
vi.mock("@/lib/instanceSettings", async (original) => ({ ...(await original<typeof import("@/lib/instanceSettings")>()), isNewUserRegistrationEnabled: async () => state.signups }));

const { prisma } = await import("@/lib/db");
const { signInExternalIdentity } = await import("@/lib/authMethods/externalIdentity");
const { consumeSamlTicket, issueSamlTicket, samlCacheProvider } = await import("@/lib/saml/state");
const { flowHash, newFlowToken } = await import("@/lib/saml/flow");

const tag = randomUUID().replace(/-/g, "").slice(0, 10);
const email = (name: string) => `${name}-${tag}@example.test`;
const provider = `saml-sso${tag}`;
const code = (promise: Promise<unknown>) => promise.then(() => "resolved", (error: { code?: string }) => error.code);
const input = (name: string, sub: string) => ({ provider, sub, email: email(name), name: null, failureCode: "saml_failed" });
let providerId = "";

beforeEach(async () => {
  state.signups = true;
  if (!providerId) providerId = (await prisma.samlProvider.create({ data: { slug: `sso${tag}`, name: "Test", entityId: "https://idp.example.test", ssoUrl: "https://idp.example.test/sso", idpCertificate: "x" } })).id;
});

afterAll(async () => {
  await prisma.samlProvider.deleteMany({ where: { slug: `sso${tag}` } });
  await prisma.outboxMessage.deleteMany({ where: { payload: { path: ["to"], string_contains: tag } } });
  await prisma.knownDevice.deleteMany({ where: { user: { email: { contains: tag } } } });
  await prisma.account.deleteMany({ where: { user: { email: { contains: tag } } } });
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.$disconnect();
});

describe("SAML and OIDC-style identities against the database", () => {
  it("creates a verified user with its link, then signs the same subject in again", async () => {
    const first = await signInExternalIdentity(input("new", `sub-${tag}-a`));
    const user = await prisma.user.findUniqueOrThrow({ where: { email: email("new") }, include: { accounts: true } });
    expect(user.emailVerified).not.toBeNull();
    expect(user.accounts).toMatchObject([{ provider, providerAccountId: `sub-${tag}-a` }]);
    expect((await signInExternalIdentity(input("new", `sub-${tag}-a`))).id).toBe(first.id);
  });
  it("never links to an existing account by email: link_from_account, and the account is untouched", async () => {
    const existing = await prisma.user.create({ data: { email: email("existing"), passwordHash: "hash", emailVerified: new Date() } });
    expect(await code(signInExternalIdentity(input("existing", `sub-${tag}-b`)))).toBe("link_from_account");
    const after = await prisma.user.findUniqueOrThrow({ where: { id: existing.id }, include: { accounts: true } });
    expect(after.accounts).toEqual([]);
  });
  it("refuses a super admin and respects the creation gate", async () => {
    await prisma.user.create({ data: { email: email("admin"), isSuperAdmin: true, emailVerified: new Date(), passwordHash: "hash" } });
    expect(await code(signInExternalIdentity(input("admin", `sub-${tag}-c`)))).toBe("super_admin_password_only");
    state.signups = false;
    expect(await code(signInExternalIdentity(input("closed", `sub-${tag}-d`)))).toBe("account_creation_disabled");
    expect(await prisma.user.count({ where: { email: email("closed") } })).toBe(0);
  });
  it("uses a login ticket exactly once, even when two sign-ins race for it", async () => {
    const token = newFlowToken();
    const ticket = await issueSamlTicket(providerId, { email: email("t"), name: null, subject: "t" }, flowHash(token));
    expect(await consumeSamlTicket(ticket, newFlowToken())).toBeNull();
    const results = await Promise.all([consumeSamlTicket(ticket, token), consumeSamlTicket(ticket, token)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
  it("uses an AuthnRequest id exactly once, bound to its provider, and refuses an expired one", async () => {
    const cache = samlCacheProvider(providerId);
    await cache.saveAsync(`_req-${tag}`, "now");
    expect(await samlCacheProvider("other").consumeAsync!(`_req-${tag}`)).toBeNull();
    const results = await Promise.all([cache.consumeAsync!(`_req-${tag}`), cache.consumeAsync!(`_req-${tag}`)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    await cache.saveAsync(`_old-${tag}`, "now");
    await prisma.samlLoginState.update({ where: { key: `_old-${tag}` }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await cache.consumeAsync!(`_old-${tag}`)).toBeNull();
  });
});
