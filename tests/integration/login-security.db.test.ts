import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { afterAll, describe, expect, it, vi } from "vitest";
import { addStaff } from "../helpers/staff";

const identity = vi.hoisted(() => ({ current: { id: "" } as { id: string } }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.current.id ? { user: identity.current } : null) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "198.51.100.9" }), cookies: async () => ({ get: () => undefined, set: () => undefined }) }));

const { prisma } = await import("@/lib/db");
const { issueLoginCode, consumeLoginCode } = await import("@/lib/loginSecurity");
const { isIpBlocked, listBlockedIps, recordFailedLogin, unblockIp } = await import("@/lib/ipBlock");
const { requestPasswordReset } = await import("@/app/actions/password-reset");
const { orgActionAccess, hasAuthenticator } = await import("@/lib/permissions");

const tag = randomUUID().slice(0, 8);
const adminEmail = `root-${tag}@example.test`;
const created: string[] = [];

/** Run the server command the way scripts/admin.sh does, against the test database. */
function admin(args: string[], password?: string) {
  const result = spawnSync(process.execPath, ["docker/ops/admin.mjs", ...args], {
    input: password ?? "",
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, PWNED_PASSWORDS_CHECK: "0" },
    encoding: "utf8",
  });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { OR: [{ email: { contains: tag } }, { id: { in: created } }] }, select: { id: true } });
  const ids = users.map((user) => user.id);
  await prisma.auditEvent.deleteMany({ where: { OR: [{ targetId: { in: ids } }, { actorUserId: { in: ids } }] } });
  await prisma.outboxMessage.deleteMany({ where: { kind: { in: ["login-code", "password-reset"] }, payload: { path: ["to"], string_contains: tag } } });
  await prisma.teamMember.deleteMany({ where: { userId: { in: ids } } });
  await prisma.organisation.deleteMany({ where: { slug: `mfa-${tag}` } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe.sequential("super admins are managed on the server", () => {
  it("creates one with a password, changes it, and revokes it", async () => {
    expect(admin(["create", "--email", adminEmail, "--name", "Root", "--password-stdin"], "short").code).toBe(65);
    const made = admin(["create", "--email", adminEmail, "--name", "Root", "--password-stdin"], "a long enough secret 1");
    expect(made).toMatchObject({ code: 0 });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
    expect(user).toMatchObject({ isSuperAdmin: true, name: "Root" });
    expect(user.emailVerified).not.toBeNull();
    expect(await bcrypt.compare("a long enough secret 1", user.passwordHash!)).toBe(true);

    expect(admin(["set-password", "--email", adminEmail, "--password-stdin"], "a different secret 22").code).toBe(0);
    const changed = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
    expect(await bcrypt.compare("a different secret 22", changed.passwordHash!)).toBe(true);
    expect(changed.sessionVersion).toBeGreaterThan(user.sessionVersion);
    expect(admin(["list"]).out).toContain(adminEmail);

    expect(admin(["set-password", "--email", `nobody-${tag}@example.test`, "--password-stdin"], "a different secret 22").code).toBe(66);
    expect(admin(["revoke", "--email", adminEmail]).code).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } })).isSuperAdmin).toBe(false);
  });

  it("never sends a super admin a password reset email", async () => {
    await prisma.user.update({ where: { email: adminEmail }, data: { isSuperAdmin: true } });
    expect(await requestPasswordReset({ email: adminEmail })).toEqual({ ok: true, data: { sent: true } });
    expect(await prisma.outboxMessage.count({ where: { kind: "password-reset", payload: { path: ["to"], equals: adminEmail } } })).toBe(0);
  });
});

describe.sequential("sign-ins from a new browser", () => {
  it("email a single-use code, at most once a minute", async () => {
    const user = await prisma.user.create({ data: { email: `member-${tag}@example.test`, emailVerified: new Date("2026-01-01") } });
    await issueLoginCode({ id: user.id, email: user.email! });
    await issueLoginCode({ id: user.id, email: user.email! });
    const sent = await prisma.outboxMessage.findMany({ where: { kind: "login-code", payload: { path: ["to"], equals: user.email! } } });
    expect(sent).toHaveLength(1);
    const code = (sent[0].payload as { code: string }).code;
    expect(await consumeLoginCode(user.id, code === "000000" ? "111111" : "000000")).toBe(false);
    expect(await consumeLoginCode(user.id, code)).toBe(true);
    expect(await consumeLoginCode(user.id, code)).toBe(false);
  });
});

describe.sequential("automatic address blocking", () => {
  it("blocks an address after 20 failed sign-ins and lets a super admin lift it", async () => {
    const ip = "203.0.113.77";
    await unblockIp(ip);
    for (let attempt = 1; attempt < 20; attempt += 1) expect(await recordFailedLogin(ip)).toBe(false);
    expect(await isIpBlocked(ip)).toBe(false);
    expect(await recordFailedLogin(ip)).toBe(true);
    expect(await isIpBlocked(ip)).toBe(true);
    expect((await listBlockedIps()).map((row) => row.ip)).toContain(ip);
    expect(await recordFailedLogin("unknown")).toBe(false);
    await unblockIp(ip);
    expect(await isIpBlocked(ip)).toBe(false);
  });
});

describe.sequential("staff need an authenticator", () => {
  it("refuses dashboard actions to a team member without one, and allows them once it's on", async () => {
    const owner = await prisma.user.create({ data: { email: `owner-${tag}@example.test`, emailVerified: new Date() } });
    const org = await prisma.organisation.create({ data: { name: "MFA Test", slug: `mfa-${tag}`, status: "ACTIVE" } });
    await addStaff(org.id, owner.id, "OWNER");
    identity.current = { id: owner.id };
    expect(await hasAuthenticator(owner.id)).toBe(false);
    expect(await orgActionAccess(org.slug, "org.settings")).toMatchObject({ ok: false, error: expect.stringContaining("authenticator") });
    await prisma.user.update({ where: { id: owner.id }, data: { mfaEnabledAt: new Date(), mfaSecretEncrypted: "v1.x.y.z" } });
    expect(await orgActionAccess(org.slug, "org.settings")).toMatchObject({ ok: true });
    identity.current = { id: "" };
  });
});
