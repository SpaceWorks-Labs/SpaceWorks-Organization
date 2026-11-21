import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.AUTH_SECRET = "d".repeat(48);
process.env.SMTP_HOST ??= "smtp.example.test";
process.env.TRUSTED_PROXY_IP_HEADER = "x-real-ip";

const state = vi.hoisted(() => ({ cookies: new Map<string, string>(), session: { id: "", sid: undefined as string | undefined } }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "198.51.100.60", "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0" }),
  cookies: async () => ({
    get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name) } : undefined),
    set: (name: string, value: string) => void state.cookies.set(name, value),
    delete: (name: string) => void state.cookies.delete(name),
  }),
}));
vi.mock("@/lib/auth", () => ({ auth: async () => (state.session.id ? { user: { id: state.session.id, email: "x@example.test" }, sid: state.session.sid, authenticatedAt: Date.now() } : null) }));

const { prisma } = await import("@/lib/db");
const { encode } = await import("next-auth/jwt");
const { sessionCookieName } = await import("@/lib/sessionCookie");
const { startUserSession, checkUserSession, listUserSessions } = await import("@/lib/userSessions");
const { revokeSession } = await import("@/app/actions/sessions");
const { revokeAllSessions } = await import("@/app/actions/security");
const { beginLinkSignInMethod, unlinkSignInMethod } = await import("@/app/actions/sign-in-methods");
const { oauthSessionGate } = await import("@/lib/authMethods/sessionGate");
const { linkExternalIdentity } = await import("@/lib/authMethods/link");
const { setLinkIntent } = await import("@/lib/linkSession");
const { countWorkingMethods } = await import("@/lib/authMethods/workingMethods");

const tag = randomUUID().replace(/-/g, "").slice(0, 10);
const email = (name: string) => `${name}-${tag}@example.test`;
const users: string[] = [];

async function person(name: string, extra: { passwordHash?: string; isSuperAdmin?: boolean } = {}) {
  const user = await prisma.user.create({ data: { email: email(name), emailVerified: new Date(), ...extra } });
  users.push(user.id);
  return user;
}

/** Sign this browser in as the user: a session row, and the JWT cookie Auth.js would have set. */
async function signIn(userId: string, provider = "credentials") {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { sessionVersion: true } });
  const sid = await startUserSession(userId, user.sessionVersion, provider);
  const name = sessionCookieName();
  state.cookies.set(name, await encode({ token: { sub: userId, sid, sessionVersion: user.sessionVersion }, secret: process.env.AUTH_SECRET!, salt: name }));
  state.session = { id: userId, sid };
  return sid;
}

beforeEach(() => { state.cookies.clear(); state.session = { id: "", sid: undefined }; });

afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { OR: [{ targetId: { in: users } }, { actorUserId: { in: users } }] } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe.sequential("server-side sessions", () => {
  it("records a session on sign-in with a short label and a shortened address, never the full user agent or address", async () => {
    const a = await person("rec");
    const sid = await signIn(a.id, "google");
    const row = await prisma.userSession.findUniqueOrThrow({ where: { id: sid } });
    expect(row).toMatchObject({ userId: a.id, method: "google", userAgent: "Firefox on Linux", ipPrefix: "198.51", revokedAt: null });
    expect(await checkUserSession(sid, a.id)).toBe(0);
  });

  it("signs out a missing session, another user's session and a revoked one", async () => {
    const a = await person("chk-a");
    const b = await person("chk-b");
    const sid = await signIn(a.id);
    expect(await checkUserSession("does-not-exist", a.id)).toBeNull();
    expect(await checkUserSession(sid, b.id)).toBeNull();
    await prisma.userSession.update({ where: { id: sid }, data: { revokedAt: new Date() } });
    expect(await checkUserSession(sid, a.id)).toBeNull();
  });

  it("writes lastSeenAt at most once every five minutes", async () => {
    const a = await person("seen");
    const sid = await signIn(a.id);
    await checkUserSession(sid, a.id);
    expect((await prisma.userSession.findUniqueOrThrow({ where: { id: sid } })).lastSeenAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
    const old = new Date(Date.now() - 10 * 60_000);
    await prisma.userSession.update({ where: { id: sid }, data: { lastSeenAt: old } });
    await checkUserSession(sid, a.id, Date.now() - 6 * 60_000);
    expect((await prisma.userSession.findUniqueOrThrow({ where: { id: sid } })).lastSeenAt).toEqual(old);
    await checkUserSession(sid, a.id);
    // The touch is deferred (after the response, or fire-and-forget outside a request), so wait for it to land.
    await expect.poll(async () => (await prisma.userSession.findUniqueOrThrow({ where: { id: sid } })).lastSeenAt.getTime(), { timeout: 5_000 }).toBeGreaterThan(old.getTime() + 60_000);
  });

  it("revokes one device without touching the others, and audits it", async () => {
    const a = await person("one");
    const other = await startUserSession(a.id, 0, "password");
    const mine = await signIn(a.id);
    expect(await revokeSession({ sessionId: other })).toEqual({ ok: true, data: { current: false } });
    expect(await checkUserSession(other, a.id)).toBeNull();
    expect(await checkUserSession(mine, a.id)).toBe(0);
    expect((await listUserSessions(a.id, 0, mine)).map((item) => [item.id, item.current])).toEqual([[mine, true]]);
    expect(await prisma.auditEvent.count({ where: { actorUserId: a.id, action: "SESSION_REVOKED" } })).toBe(1);
    expect(await revokeSession({ sessionId: mine })).toEqual({ ok: true, data: { current: true } });
  });

  it("refuses to revoke another user's session", async () => {
    const a = await person("own");
    const b = await person("intruder");
    const victim = await startUserSession(a.id, 0, "password");
    await signIn(b.id);
    expect((await revokeSession({ sessionId: victim })).ok).toBe(false);
    expect(await checkUserSession(victim, a.id)).toBe(0);
    expect(await prisma.auditEvent.count({ where: { action: "SESSION_REVOKED", actorUserId: b.id } })).toBe(0);
  });

  it("signs out everywhere: every row revoked, the version bumped, one audit row", async () => {
    const a = await person("all");
    const first = await startUserSession(a.id, 0, "password");
    const second = await signIn(a.id);
    expect(await revokeAllSessions()).toEqual({ ok: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).sessionVersion).toBe(1);
    expect(await checkUserSession(first, a.id)).toBeNull();
    expect(await checkUserSession(second, a.id)).toBeNull();
    expect(await prisma.userSession.count({ where: { userId: a.id, revokedAt: null } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { actorUserId: a.id, action: "SESSIONS_REVOKED" } })).toBe(1);
  });

  it("treats a row made under an older version as signed out, as after a password reset", async () => {
    const a = await person("ver");
    const sid = await signIn(a.id);
    await prisma.user.update({ where: { id: a.id }, data: { sessionVersion: { increment: 1 } } });
    expect(await checkUserSession(sid, a.id)).toBeNull();
    expect(await listUserSessions(a.id, 1, sid)).toEqual([]);
  });
});

describe.sequential("linking sign-in methods", () => {
  it("links a bridge or SAML identity to the signed-in user, refuses one linked elsewhere, and never links a super admin", async () => {
    const a = await person("link-a");
    const b = await person("link-b");
    const admin = await person("link-admin", { isSuperAdmin: true });
    expect(await linkExternalIdentity(a.id, "supabase", "oidc", `sub-${tag}`)).toMatchObject({ ok: true, user: { id: a.id } });
    expect(await prisma.account.count({ where: { userId: a.id, provider: "supabase" } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { actorUserId: a.id, action: "IDENTITY_LINKED" } })).toBe(1);
    expect(await linkExternalIdentity(a.id, "supabase", "oidc", `sub-${tag}`)).toMatchObject({ ok: true });
    expect(await linkExternalIdentity(b.id, "supabase", "oidc", `sub-${tag}`)).toEqual({ ok: false, code: "identity_linked_elsewhere" });
    expect(await linkExternalIdentity(admin.id, "supabase", "oidc", `sub-other-${tag}`)).toEqual({ ok: false, code: "super_admin_password_only" });
    expect(await prisma.account.count({ where: { userId: { in: [b.id, admin.id] } } })).toBe(0);
  });

  it("the OAuth gate links only from a live session that asked, to that user, and never to a revoked session", async () => {
    const a = await person("gate-a");
    const b = await person("gate-b");
    expect(await oauthSessionGate("google", `g-${tag}`)).toBeUndefined();

    const sid = await signIn(a.id);
    expect(await oauthSessionGate("google", `g-${tag}`)).toBe("/account/security?link=not_requested");
    await setLinkIntent({ userId: b.id, provider: "google" });
    expect(await oauthSessionGate("google", `g-${tag}`)).toBe("/account/security?link=not_requested");
    await setLinkIntent({ userId: a.id, provider: "github" });
    expect(await oauthSessionGate("google", `g-${tag}`)).toBe("/account/security?link=not_requested");
    await setLinkIntent({ userId: a.id, provider: "google" });
    expect(await oauthSessionGate("google", `g-${tag}`)).toBe(true);

    await prisma.account.create({ data: { userId: b.id, type: "oauth", provider: "google", providerAccountId: `taken-${tag}` } });
    expect(await oauthSessionGate("google", `taken-${tag}`)).toBe("/account/security?link=identity_linked_elsewhere");

    await prisma.userSession.update({ where: { id: sid }, data: { revokedAt: new Date() } });
    expect(await oauthSessionGate("google", `g-${tag}`)).toBe("/login?error=session_expired");
    expect(state.cookies.has(sessionCookieName())).toBe(false);
  });

  it("begins linking only for a method that is on, and never for a super admin", async () => {
    const a = await person("begin-a");
    await signIn(a.id);
    expect((await beginLinkSignInMethod({ provider: "google" })).ok).toBe(false);
    const admin = await person("begin-admin", { isSuperAdmin: true });
    await signIn(admin.id);
    expect((await beginLinkSignInMethod({ provider: "google" })).ok).toBe(false);
  });

  it("unlinks an identity while a password remains, and refuses to remove the last working way in", async () => {
    const withPassword = await person("unlink-pw", { passwordHash: "hash" });
    const linked = await prisma.account.create({ data: { userId: withPassword.id, type: "oauth", provider: "github", providerAccountId: `gh-${tag}` } });
    await signIn(withPassword.id);
    expect(await countWorkingMethods(withPassword.id)).toBe(1);
    expect(await unlinkSignInMethod({ accountId: linked.id })).toEqual({ ok: true });
    expect(await prisma.account.count({ where: { userId: withPassword.id } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { actorUserId: withPassword.id, action: "IDENTITY_UNLINKED" } })).toBe(1);

    // No password, and the only identity belongs to a method that is not switched on: nothing would work either way.
    const only = await person("unlink-only");
    const last = await prisma.account.create({ data: { userId: only.id, type: "oauth", provider: "github", providerAccountId: `gh2-${tag}` } });
    await signIn(only.id);
    expect((await unlinkSignInMethod({ accountId: last.id })).ok).toBe(false);
    expect(await prisma.account.count({ where: { userId: only.id } })).toBe(1);
  });

  it("only unlinks the caller's own identities", async () => {
    const a = await person("own-a", { passwordHash: "hash" });
    const b = await person("own-b", { passwordHash: "hash" });
    const theirs = await prisma.account.create({ data: { userId: b.id, type: "oauth", provider: "github", providerAccountId: `gh3-${tag}` } });
    await signIn(a.id);
    expect((await unlinkSignInMethod({ accountId: theirs.id })).ok).toBe(false);
    expect(await prisma.account.count({ where: { id: theirs.id } })).toBe(1);
  });
});
