import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.AUTH_SECRET = "b".repeat(48);
process.env.AUTH_FIREBASE_API_KEY = "AIzaSyExampleKey123";
process.env.AUTH_FIREBASE_AUTH_DOMAIN = "demo-project.firebaseapp.com";
process.env.AUTH_FIREBASE_PROJECT_ID = "demo-project";
process.env.AUTH_SUPABASE_URL = "https://demo-project.supabase.co";
process.env.AUTH_SUPABASE_ANON_KEY = "sb_publishable_example";

const state = vi.hoisted(() => ({ identity: null as null | { sub: string; email: string; name: string | null }, signups: true }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "198.51.100.77", "user-agent": "Vitest" }),
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}));
vi.mock("next-auth", () => ({ CredentialsSignin: class extends Error { code = "credentials"; } }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("@/lib/ipBlock", () => ({ isIpBlocked: async () => false, recordFailedLogin: async () => false }));
vi.mock("@/lib/bridgeTokens", () => ({
  verifyFirebaseIdToken: async () => ({ ok: true, identity: state.identity }),
  verifySupabaseToken: async () => ({ ok: true, identity: state.identity }),
}));
vi.mock("@/lib/instanceSettings", async (original) => ({ ...(await original<typeof import("@/lib/instanceSettings")>()), isNewUserRegistrationEnabled: async () => state.signups }));

const { prisma } = await import("@/lib/db");
const { authorizeBridge } = await import("@/lib/bridgeSignIn");

const tag = randomUUID().replace(/-/g, "").slice(0, 10);
const email = (name: string) => `${name}-${tag}@example.test`;
const request = new Request("https://example.test/api/auth/callback/firebase");
const token = { token: "t".repeat(40) };
const code = (promise: Promise<unknown>) => promise.then(() => "resolved", (error: { code?: string }) => error.code);

beforeEach(() => { state.signups = true; });

afterAll(async () => {
  await prisma.outboxMessage.deleteMany({ where: { payload: { path: ["to"], string_contains: tag } } });
  await prisma.knownDevice.deleteMany({ where: { user: { email: { contains: tag } } } });
  await prisma.account.deleteMany({ where: { user: { email: { contains: tag } } } });
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.$disconnect();
});

describe("bridge sign-in against the database", () => {
  it("creates a verified user and links the provider's sub, then signs the same person in again", async () => {
    state.identity = { sub: `uid-${tag}-a`, email: email("new"), name: "New Person" };
    const first = await authorizeBridge("firebase", token, request);
    expect(first).toMatchObject({ email: email("new") });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: email("new") }, include: { accounts: true } });
    expect(user.emailVerified).not.toBeNull();
    expect(user.passwordHash).toBeNull();
    expect(user.accounts).toMatchObject([{ provider: "firebase", providerAccountId: `uid-${tag}-a` }]);
    const second = await authorizeBridge("firebase", token, request);
    expect(second?.id).toBe(first?.id);
    expect(await prisma.account.count({ where: { userId: user.id } })).toBe(1);
  });

  it("never links a bridge identity to an existing account by email, and leaves that account untouched", async () => {
    const existing = await prisma.user.create({ data: { email: email("existing"), passwordHash: "hash", emailVerified: new Date() } });
    state.identity = { sub: `uid-${tag}-b`, email: email("existing").toUpperCase().replace("@EXAMPLE.TEST", "@example.test"), name: null };
    expect(await code(authorizeBridge("supabase", token, request))).toBe("bridge_link_refused");
    const after = await prisma.user.findUniqueOrThrow({ where: { id: existing.id }, include: { accounts: true } });
    expect(after.passwordHash).toBe("hash");
    expect(after.accounts).toEqual([]);
    expect(await prisma.user.count({ where: { email: { contains: `existing-${tag}`, mode: "insensitive" } } })).toBe(1);
  });

  it("refuses a super admin and an unverified password account, creating nothing", async () => {
    await prisma.user.create({ data: { email: email("admin"), isSuperAdmin: true, emailVerified: new Date(), passwordHash: "hash" } });
    state.identity = { sub: `uid-${tag}-c`, email: email("admin"), name: null };
    expect(await code(authorizeBridge("firebase", token, request))).toBe("super_admin_password_only");
    await prisma.user.create({ data: { email: email("squat"), passwordHash: "hash" } });
    state.identity = { sub: `uid-${tag}-d`, email: email("squat"), name: null };
    expect(await code(authorizeBridge("firebase", token, request))).toBe("bridge_failed");
    expect(await prisma.account.count({ where: { providerAccountId: { in: [`uid-${tag}-c`, `uid-${tag}-d`] } } })).toBe(0);
  });

  it("does not create an account while sign-ups are off", async () => {
    state.signups = false;
    state.identity = { sub: `uid-${tag}-e`, email: email("closed"), name: null };
    expect(await code(authorizeBridge("firebase", token, request))).toBe("account_creation_disabled");
    expect(await prisma.user.findUnique({ where: { email: email("closed") } })).toBeNull();
  });
});
