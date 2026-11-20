import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addStaff, starterRole } from "../helpers/staff";

process.env.AUTH_SECRET = "i".repeat(48);
process.env.PWNED_PASSWORDS_CHECK = "0";

const jar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "198.51.100.40" }),
  cookies: async () => ({
    get: (name: string) => (name === "swo.invite-signup" && jar.value ? { value: jar.value } : undefined),
    set: (name: string, value: string) => { if (name === "swo.invite-signup") jar.value = value; },
    delete: (name: string) => { if (name === "swo.invite-signup") jar.value = undefined; },
  }),
}));
// The invite actions read the session through Auth.js, which doesn't load outside Next; nobody is signed in here.
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("@/lib/ipBlock", () => ({ currentRequestBlocked: async () => false }));
// Account creation is switched off for the whole instance in every test here.
vi.mock("@/lib/instanceSettings", async (original) => ({ ...(await original<typeof import("@/lib/instanceSettings")>()), isNewUserRegistrationEnabled: async () => false }));

const { prisma } = await import("@/lib/db");
const { signInviteCookie } = await import("@/lib/inviteLink");
const { signUpWithPassword } = await import("@/app/actions/auth");
const { startInviteSignup } = await import("@/app/actions/invite-acceptance");

const tag = randomUUID().replace(/-/g, "").slice(0, 10);
const password = "a-long-passphrase-for-tests";
let organisationId = "";
let ownerId = "";
let roleId = "";
let counter = 0;

/** A staff invite; the token has the shape real ones do (long, URL-safe). */
async function makeInvite(data: { email?: string; usedAt?: Date; expiresAt?: Date } = {}) {
  const token = `inv${tag}${String(++counter).padStart(4, "0")}`.padEnd(32, "x");
  await prisma.teamInvite.create({ data: { organisationId, roleId, token, createdByUserId: ownerId, ...data } });
  return token;
}

const emailFor = (name: string) => `${name}-${tag}@example.test`;
const signUp = (name: string, email = emailFor(name)) => signUpWithPassword({ name, email, password });
const userExists = (email: string) => prisma.user.findUnique({ where: { email }, select: { id: true } }).then(Boolean);

beforeAll(async () => {
  const owner = await prisma.user.create({ data: { email: emailFor("owner"), emailVerified: new Date(), name: "Owner" } });
  ownerId = owner.id;
  const org = await prisma.organisation.create({ data: { name: "Invite org", slug: `invite-${tag}`, status: "ACTIVE" } });
  organisationId = org.id;
  await addStaff(org.id, owner.id, "OWNER");
  roleId = (await starterRole(org.id, "VIEWER")).id;
});

beforeEach(() => { jar.value = undefined; });

afterAll(async () => {
  await prisma.outboxMessage.deleteMany({ where: { payload: { path: ["to"], string_contains: tag } } });
  await prisma.teamInvite.deleteMany({ where: { organisationId } });
  await prisma.teamMember.deleteMany({ where: { organisationId } });
  await prisma.organisation.deleteMany({ where: { id: organisationId } });
  const users = await prisma.user.findMany({ where: { email: { contains: tag } }, select: { id: true } });
  await prisma.verificationToken.deleteMany({ where: { identifier: { in: users.map((user) => `email-verification:${user.id}`) } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
  await prisma.$disconnect();
});

describe("password sign-up through a staff invite while new accounts are switched off", () => {
  it("is refused without the invite cookie", async () => {
    await makeInvite();
    const result = await signUp("nocookie");
    expect(result).toMatchObject({ ok: false });
    expect(await userExists(emailFor("nocookie"))).toBe(false);
  });

  it("is allowed with the cookie from the invite page, and the verification link returns to the invite", async () => {
    const token = await makeInvite();
    expect(await startInviteSignup(token)).toEqual({ ok: true });
    expect(jar.value).toBeTruthy();
    expect(await signUp("allowed")).toEqual({ ok: true, data: { email: emailFor("allowed") } });
    expect(await userExists(emailFor("allowed"))).toBe(true);
    const mail = await prisma.outboxMessage.findFirst({ where: { payload: { path: ["to"], equals: emailFor("allowed") } } });
    const url = (mail?.payload as { verificationUrl?: string } | null)?.verificationUrl ?? "";
    expect(new URL(url).searchParams.get("next")).toBe(`/join/org/${token}`);
  });

  it("creates one account per invite: a second email through the same link is refused, a retry of the first is not", async () => {
    const token = await makeInvite();
    expect(await startInviteSignup(token)).toEqual({ ok: true });
    expect(await signUp("firstonly")).toEqual({ ok: true, data: { email: emailFor("firstonly") } });
    expect(await signUp("secondtry")).toMatchObject({ ok: false });
    expect(await userExists(emailFor("secondtry"))).toBe(false);
    expect((await prisma.teamInvite.findUniqueOrThrow({ where: { token } })).signupEmail).toBe(emailFor("firstonly"));
    // The same person retrying (a double submit) is answered as before and creates nothing new.
    expect(await signUp("firstonly")).toEqual({ ok: true, data: { email: emailFor("firstonly") } });
  });

  it("is refused with a forged or tampered cookie", async () => {
    const token = await makeInvite();
    const [t, exp, sig] = signInviteCookie(token).split(".");
    jar.value = `${t}.${exp}.${sig.slice(0, -3)}abc`;
    expect(await signUp("forged")).toMatchObject({ ok: false });
    expect(await userExists(emailFor("forged"))).toBe(false);
  });

  it("is refused with an expired cookie", async () => {
    const token = await makeInvite();
    jar.value = signInviteCookie(token, Date.now() - 31 * 60 * 1000);
    expect(await signUp("staled")).toMatchObject({ ok: false });
  });

  it.each([
    ["used", () => makeInvite({ usedAt: new Date(), })],
    ["expired", () => makeInvite({ expiresAt: new Date(Date.now() - 1000) })],
  ])("is refused for a %s invite even with a valid cookie", async (name, create) => {
    const token = await create();
    jar.value = signInviteCookie(token);
    expect(await signUp(`${name}invite`)).toMatchObject({ ok: false });
    expect(await userExists(emailFor(`${name}invite`))).toBe(false);
    expect(await startInviteSignup(token)).toMatchObject({ ok: false });
  });

  it("is refused for a revoked invite even with a valid cookie", async () => {
    const token = await makeInvite();
    jar.value = signInviteCookie(token);
    await prisma.teamInvite.deleteMany({ where: { token } });
    expect(await signUp("revoked")).toMatchObject({ ok: false });
    expect(await userExists(emailFor("revoked"))).toBe(false);
  });

  it("on an email-bound invite, is refused for another address and allowed for the bound one", async () => {
    const token = await makeInvite({ email: emailFor("bound").toUpperCase() });
    jar.value = signInviteCookie(token);
    expect(await signUp("wrong")).toMatchObject({ ok: false });
    expect(await userExists(emailFor("wrong"))).toBe(false);
    expect(await signUp("bound")).toEqual({ ok: true, data: { email: emailFor("bound") } });
    expect(await userExists(emailFor("bound"))).toBe(true);
  });

  it("never makes a super admin", async () => {
    const token = await makeInvite();
    jar.value = signInviteCookie(token);
    await signUp("plain");
    expect((await prisma.user.findUnique({ where: { email: emailFor("plain") }, select: { isSuperAdmin: true } }))?.isSuperAdmin).toBe(false);
  });
});
