import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireSuperAdmin: vi.fn(), rateLimit: vi.fn(), findSetting: vi.fn(), upsert: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requireSuperAdmin: mocks.requireSuperAdmin }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: mocks.rateLimit }));
vi.mock("@/lib/db", () => ({ prisma: { instanceSetting: { findUnique: mocks.findSetting, upsert: mocks.upsert } } }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: mocks.audit }));
vi.mock("@/lib/oauthProviders", () => ({ getOAuthSettings: async () => ({ google: null, github: null, apple: null }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveLoginMethods } from "@/app/actions/login-methods";

const all = { password: true, google: true, apple: true, github: true, supabase: true, firebase: true };
const storedAllOn = { passwordSignIn: true, googleSignIn: true, appleSignIn: true, githubSignIn: true, oidcSignIn: true, samlSignIn: true, supabaseSignIn: true, firebaseSignIn: true, passkeySignIn: true, phoneSignIn: true };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireSuperAdmin.mockResolvedValue({ user: { id: "admin_1" } });
  mocks.rateLimit.mockResolvedValue(false);
  mocks.findSetting.mockResolvedValue(storedAllOn);
});
afterEach(() => vi.unstubAllEnvs());

describe("login methods action", () => {
  it("saves the switches and audits only the changed field names", async () => {
    expect(await saveLoginMethods({ ...all, password: false, github: false })).toEqual({ ok: true });
    expect(mocks.upsert.mock.calls[0][0].update).toEqual({ passwordSignIn: false, googleSignIn: true, appleSignIn: true, githubSignIn: false, supabaseSignIn: true, firebaseSignIn: true });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "LOGIN_METHODS_UPDATED", actorUserId: "admin_1", metadata: { changed: "passwordSignIn,githubSignIn" } }));
  });
  it("writes no audit row when nothing changed", async () => {
    await saveLoginMethods(all);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("is for super admins only: the guard decides before anything is read or written", async () => {
    mocks.requireSuperAdmin.mockRejectedValue(new Error("forbidden"));
    await expect(saveLoginMethods(all)).rejects.toThrow("forbidden");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("is rate limited and validates input", async () => {
    mocks.rateLimit.mockResolvedValue(true);
    expect(await saveLoginMethods(all)).toMatchObject({ ok: false });
    mocks.rateLimit.mockResolvedValue(false);
    expect(await saveLoginMethods({ password: "yes" })).toMatchObject({ ok: false });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("is read-only while the server sets LOGIN_METHODS", async () => {
    vi.stubEnv("LOGIN_METHODS", "password,google");
    expect(await saveLoginMethods(all)).toMatchObject({ ok: false, error: expect.stringContaining("LOGIN_METHODS") });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
