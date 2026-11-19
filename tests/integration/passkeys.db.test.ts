import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { SoftPasskey } from "../helpers/softPasskey";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "198.51.100.44", "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36" }),
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined), set: (name: string, value: string) => void jar.set(name, value), delete: (name: string) => void jar.delete(name) }),
}));
vi.mock("next-auth", () => ({ CredentialsSignin: class extends Error { code = "credentials"; } }));
vi.mock("next-auth/providers/credentials", () => ({ default: (options: unknown) => options }));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { prisma } = await import("@/lib/db");
const { passkeyRelyingParty } = await import("@/lib/passkeys/config");
const { consumeChallenge, peekChallenge, saveChallenge, saveSignInChallenge } = await import("@/lib/passkeys/challenges");
const { beginRegistration, finishRegistration, removePasskey, renamePasskey } = await import("@/lib/passkeys/manage");
const { authorizePasskey } = await import("@/lib/authMethods/passkey");

const tag = randomUUID().replace(/-/g, "").slice(0, 10);
const rp = passkeyRelyingParty();
const request = new Request("https://example.test/api/auth/callback/passkey", { headers: { "x-real-ip": "198.51.100.44" } });
const on = { statuses: [{ method: "passkey", state: "available" }], available: ["passkey", "password"], oidc: [], saml: [] } as never;
const loginOn = { available: ["passkey", "password"], oidc: [], saml: [] } as never;
const user = async (name: string, over: Record<string, unknown> = {}) => prisma.user.create({ data: { email: `${name}-${tag}@example.test`, emailVerified: new Date(), ...over } });
const code = (promise: Promise<unknown>) => promise.then((value) => (value ? "signed-in" : "refused"), (error: { code?: string }) => error.code);

/** Register a software passkey for a person through the real begin/finish pair. */
async function register(person: { id: string; email: string | null }, key = new SoftPasskey()) {
  const begun = await beginRegistration({ id: person.id, email: person.email!, name: null });
  if (!begun.ok) throw new Error(begun.error);
  const done = await finishRegistration(person.id, key.register({ rpID: rp.rpID, origin: rp.origin, challenge: begun.data!.challenge }), "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36");
  return { key, done };
}

/** A sign-in attempt: a fresh server challenge named by the cookie, then the authenticator's answer. */
async function signIn(key: SoftPasskey, counter: number, extra: { totp?: string } = {}) {
  const challenge = `chal-${randomUUID().replace(/-/g, "")}`;
  await saveSignInChallenge(challenge);
  return authorizePasskey({ response: JSON.stringify(key.assert({ rpID: rp.rpID, origin: rp.origin, challenge, counter })), ...extra }, request, on);
}

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { contains: tag } }, select: { id: true } });
  const ids = users.map((row) => row.id);
  await prisma.auditEvent.deleteMany({ where: { OR: [{ actorUserId: { in: ids } }, { targetId: { in: ids } }] } });
  await prisma.outboxMessage.deleteMany({ where: { payload: { path: ["userId"], string_contains: ids[0] ?? "none" } } });
  await prisma.knownDevice.deleteMany({ where: { userId: { in: ids } } });
  await prisma.passkeyChallenge.deleteMany({ where: { OR: [{ key: { startsWith: "sin:" } }, { key: { in: ids.map((id) => `reg:${id}`) } }] } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe.sequential("passkey challenges", () => {
  it("are used once, even when two callers race, and expire after five minutes", async () => {
    await saveChallenge(`reg:${tag}-a`, "register", "abc");
    expect(await peekChallenge(`reg:${tag}-a`, "register")).toBe("abc");
    expect(await peekChallenge(`reg:${tag}-a`, "sign-in")).toBeNull();
    const results = await Promise.all([consumeChallenge(`reg:${tag}-a`), consumeChallenge(`reg:${tag}-a`)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    await saveChallenge(`reg:${tag}-b`, "register", "def", Date.now() - 6 * 60_000);
    expect(await peekChallenge(`reg:${tag}-b`, "register")).toBeNull();
    expect(await consumeChallenge(`reg:${tag}-b`)).toBe(false);
  });
});

describe.sequential("register, sign in and remove", () => {
  it("registers a passkey (audited), signs in with it, tracks its counter and last use, then removes it", async () => {
    const person = await user("walk", { passwordHash: "hash" });
    const { key, done } = await register(person);
    expect(done).toMatchObject({ ok: true });
    const stored = await prisma.passkey.findFirstOrThrow({ where: { userId: person.id } });
    expect(stored).toMatchObject({ credentialId: key.id, counter: BigInt(0), name: "Chrome on Windows" });
    expect(await prisma.auditEvent.count({ where: { action: "PASSKEY_ADDED", actorUserId: person.id, targetId: stored.id } })).toBe(1);

    expect(await renamePasskey(person.id, stored.id, "Work laptop")).toEqual({ ok: true });
    expect(await signIn(key, 5)).toMatchObject({ id: person.id });
    const used = await prisma.passkey.findUniqueOrThrow({ where: { id: stored.id } });
    expect(used).toMatchObject({ counter: BigInt(5), name: "Work laptop" });
    expect(used.lastUsedAt).not.toBeNull();
    expect(await prisma.knownDevice.count({ where: { userId: person.id } })).toBe(1);

    expect(await removePasskey(person.id, stored.id, loginOn)).toEqual({ ok: true });
    expect(await prisma.auditEvent.count({ where: { action: "PASSKEY_REMOVED", actorUserId: person.id } })).toBe(1);
    expect(await code(signIn(key, 6))).toBe("refused");
  });

  it("refuses an old counter, audits the suspected clone, and refuses the same answer twice", async () => {
    const person = await user("clone", { passwordHash: "hash" });
    const { key } = await register(person);
    expect(await signIn(key, 7)).toMatchObject({ id: person.id });
    expect(await code(signIn(key, 7))).toBe("refused");
    expect(await code(signIn(key, 2))).toBe("refused");
    expect(await prisma.auditEvent.count({ where: { action: "PASSKEY_COUNTER_ROLLBACK", actorUserId: person.id } })).toBe(2);
    expect((await prisma.passkey.findFirstOrThrow({ where: { userId: person.id } })).counter).toBe(BigInt(7));

    const challenge = "reused-challenge";
    await saveSignInChallenge(challenge);
    const answer = JSON.stringify(key.assert({ rpID: rp.rpID, origin: rp.origin, challenge, counter: 8 }));
    expect(await authorizePasskey({ response: answer }, request, on)).toMatchObject({ id: person.id });
    expect(await authorizePasskey({ response: answer }, request, on)).toBeNull();
  });

  it("cannot remove or rename another person's passkey", async () => {
    const owner = await user("owner", { passwordHash: "hash" });
    const other = await user("other", { passwordHash: "hash" });
    const { done } = await register(owner);
    const id = (done as { data: { id: string } }).data.id;
    expect(await removePasskey(other.id, id, loginOn)).toMatchObject({ ok: false });
    expect(await renamePasskey(other.id, id, "Mine now")).toMatchObject({ ok: false });
    expect(await prisma.passkey.count({ where: { id, userId: owner.id, name: { not: "Mine now" } } })).toBe(1);
  });

  it("refuses to remove the last working way to sign in, but allows it once another remains", async () => {
    const only = await user("only");
    const { done } = await register(only);
    const id = (done as { data: { id: string } }).data.id;
    expect(await removePasskey(only.id, id, loginOn)).toMatchObject({ ok: false });
    expect(await prisma.passkey.count({ where: { id } })).toBe(1);
    await prisma.user.update({ where: { id: only.id }, data: { passwordHash: "hash" } });
    expect(await removePasskey(only.id, id, loginOn)).toEqual({ ok: true });
  });

  it("does not let a second registration reuse a credential, and refuses a super admin's passkey at sign-in", async () => {
    const person = await user("dup", { passwordHash: "hash" });
    const { key } = await register(person);
    const again = await beginRegistration({ id: person.id, email: person.email!, name: null });
    if (!again.ok) throw new Error("begin failed");
    const second = await finishRegistration(person.id, key.register({ rpID: rp.rpID, origin: rp.origin, challenge: again.data!.challenge }), null);
    expect(second).toMatchObject({ ok: false });

    const admin = await user("admin", { passwordHash: "hash", isSuperAdmin: true });
    const adminKey = new SoftPasskey();
    await prisma.passkey.create({ data: { userId: admin.id, credentialId: adminKey.id, publicKey: adminKey.publicKey, deviceType: "singleDevice", name: "Planted" } });
    expect(await signIn(adminKey, 1)).toBeNull();
  });

  it("registers only against this person's own challenge and origin", async () => {
    const person = await user("origin", { passwordHash: "hash" });
    const begun = await beginRegistration({ id: person.id, email: person.email!, name: null });
    if (!begun.ok) throw new Error("begin failed");
    const key = new SoftPasskey();
    const wrong = await finishRegistration(person.id, key.register({ rpID: rp.rpID, origin: rp.origin, challenge: begun.data!.challenge, clientOrigin: "https://evil.example" }), null);
    expect(wrong).toMatchObject({ ok: false });
    // The failed attempt used the challenge up: the correct answer can no longer be replayed against it.
    expect(await finishRegistration(person.id, key.register({ rpID: rp.rpID, origin: rp.origin, challenge: begun.data!.challenge }), null)).toMatchObject({ ok: false });
    expect(await prisma.passkey.count({ where: { userId: person.id } })).toBe(0);
  });
});
