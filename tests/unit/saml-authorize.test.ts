import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  cookieDelete: vi.fn(), ticket: vi.fn(), refusal: vi.fn(), audit: vi.fn(), limited: vi.fn(), accountFind: vi.fn(), userFind: vi.fn(),
  tx: { user: { create: vi.fn() }, account: { create: vi.fn() } }, linked: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ delete: m.cookieDelete }) }));
vi.mock("next-auth", () => ({ CredentialsSignin: class extends Error { code = "credentials"; } }));
vi.mock("next-auth/providers/credentials", () => ({ default: (options: unknown) => options }));
vi.mock("@/lib/saml/state", () => ({ consumeSamlTicket: m.ticket }));
vi.mock("@/lib/authAudit", () => ({ auditSignInFailed: m.audit, auditIdentityLinked: m.linked }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: m.limited }));
vi.mock("@/lib/ipBlock", () => ({ isIpBlocked: async () => false }));
vi.mock("@/lib/rateLimit", () => ({ getClientIpFromHeaders: () => "203.0.113.7" }));
vi.mock("@/lib/linkSession", () => ({ activeLinkTarget: async () => null }));
vi.mock("@/lib/signInRules", () => ({ identityRefusal: m.refusal }));
vi.mock("@/lib/loginSecurity", () => ({ recognisedDevice: async () => null, rememberDevice: async () => undefined }));
vi.mock("@/lib/db", () => ({ prisma: { account: { findUnique: m.accountFind }, $transaction: async (run: (tx: unknown) => unknown) => run(m.tx) } }));

import { authorizeSaml } from "@/lib/authMethods/saml";

const context = (off = false) => ({ statuses: [{ method: "saml", state: off ? "switched_off" : "available" }], saml: [{ id: "prov_1", slug: "campus" }] }) as never;
const FLOW = "f".repeat(43);
const request = new Request("https://example.test/api/auth/callback/saml", { headers: { cookie: `swo.saml-flow=${FLOW}` } });
const bare = new Request("https://example.test/api/auth/callback/saml");
const ticket = { ticket: "t".repeat(43) };
const identity = { email: "person@example.test", name: "Pat", subject: "person@example.test", providerId: "prov_1" };
const run = (raw: unknown = ticket, off = false) => authorizeSaml(raw, request, context(off)).then((value) => value, (error: { code?: string }) => `error:${error.code}`);
const made = { id: "u1", name: "Pat", email: identity.email, image: null, sessionVersion: 0, emailVerified: new Date(), isSuperAdmin: false };

beforeEach(() => {
  vi.clearAllMocks();
  m.limited.mockResolvedValue(false);
  m.ticket.mockResolvedValue(identity);
  m.refusal.mockResolvedValue(null);
  m.accountFind.mockResolvedValue(null);
  m.tx.user.create.mockResolvedValue(made);
});

describe("SAML sign-in through Auth.js", () => {
  it("refuses a ticket posted without this browser's flow cookie, without touching the ticket", async () => {
    expect(await authorizeSaml(ticket, bare, context()).then((value) => value, (error: { code?: string }) => `error:${error.code}`)).toBe("error:saml_flow");
    expect(m.ticket).not.toHaveBeenCalled();
    expect(m.audit).toHaveBeenCalledWith("saml", "no_flow_cookie");
  });
  it("hands the flow cookie's token to the ticket check and clears the cookie on success", async () => {
    expect(await run()).toMatchObject({ id: "u1" });
    expect(m.ticket).toHaveBeenCalledWith(ticket.ticket, FLOW);
    expect(m.cookieDelete).toHaveBeenCalledWith({ name: "swo.saml-flow", path: "/api/auth" });
  });
  it("refuses with method_disabled when SAML is switched off, without touching the ticket", async () => {
    expect(await run(ticket, true)).toBe("error:method_disabled");
    expect(m.ticket).not.toHaveBeenCalled();
  });
  it("refuses a ticket that is unknown, used or expired, and audits the reason", async () => {
    m.ticket.mockResolvedValue(null);
    expect(await run()).toBe("error:saml_failed");
    expect(m.audit).toHaveBeenCalledWith("saml", "bad_ticket");
  });
  it("refuses a ticket whose provider is no longer enabled", async () => {
    m.ticket.mockResolvedValue({ ...identity, providerId: "prov_gone" });
    expect(await run()).toBe("error:method_disabled");
  });
  it("never links by email: an existing account with no link for this provider is refused, and nothing is created", async () => {
    m.refusal.mockResolvedValue("link_from_account");
    expect(await run()).toBe("error:link_from_account");
    expect(m.refusal).toHaveBeenCalledWith(identity.email, "saml-prov_1", identity.subject, { linkByEmail: false });
    expect(m.tx.user.create).not.toHaveBeenCalled();
    expect(m.audit).toHaveBeenCalledWith("saml", "link_from_account");
  });
  it("applies the creation gate and the super admin refusal", async () => {
    m.refusal.mockResolvedValue("account_creation_disabled");
    expect(await run()).toBe("error:account_creation_disabled");
    m.refusal.mockResolvedValue("super_admin_password_only");
    expect(await run()).toBe("error:super_admin_password_only");
  });
  it("creates the account and its link together and audits the link", async () => {
    expect(await run()).toMatchObject({ id: "u1", email: identity.email });
    expect(m.tx.account.create).toHaveBeenCalledWith({ data: { userId: "u1", type: "saml", provider: "saml-prov_1", providerAccountId: identity.subject } });
    expect(m.linked).toHaveBeenCalledWith("u1", "saml-prov_1");
  });
  it("signs in the account already linked to that subject", async () => {
    m.accountFind.mockResolvedValue({ user: made });
    expect(await run()).toMatchObject({ id: "u1" });
    expect(m.tx.user.create).not.toHaveBeenCalled();
  });
});
