import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  available: ["passkey"] as string[], user: vi.fn(), recent: vi.fn(), limited: vi.fn(), begin: vi.fn(), finish: vi.fn(), remove: vi.fn(), rename: vi.fn(), options: vi.fn(), save: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "user-agent": "Test" }) }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: m.user } } }));
vi.mock("@/lib/permissions", () => ({ requireAuth: async () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/reauth", () => ({ hasRecentAuthentication: m.recent }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: m.limited }));
vi.mock("@/lib/loginMethods", () => ({ loadLoginMethods: async () => ({ available: m.available }) }));
vi.mock("@/lib/passkeys/manage", () => ({ beginRegistration: m.begin, finishRegistration: m.finish, removePasskey: m.remove, renamePasskey: m.rename }));
vi.mock("@simplewebauthn/server", () => ({ generateAuthenticationOptions: m.options }));
vi.mock("@/lib/passkeys/challenges", () => ({ saveSignInChallenge: m.save }));

import { beginPasskeyRegistration, finishPasskeyRegistration, removePasskey } from "@/app/actions/passkeys";
import { beginPasskeySignIn } from "@/app/actions/passkey-sign-in";

beforeEach(() => {
  vi.clearAllMocks();
  m.available = ["passkey"];
  m.user.mockResolvedValue({ id: "u1", email: "person@example.test", name: null, isSuperAdmin: false });
  m.recent.mockResolvedValue(true);
  m.limited.mockResolvedValue(false);
  m.begin.mockResolvedValue({ ok: true, data: { challenge: "c" } });
  m.options.mockResolvedValue({ challenge: "c2" });
});

describe("passkey actions", () => {
  it("are gone while the method is off: nothing starts, nothing is stored", async () => {
    m.available = ["password"];
    expect(await beginPasskeyRegistration()).toMatchObject({ ok: false });
    expect(await finishPasskeyRegistration({})).toMatchObject({ ok: false });
    expect(await beginPasskeySignIn()).toMatchObject({ ok: false });
    expect(m.begin).not.toHaveBeenCalled();
    expect(m.save).not.toHaveBeenCalled();
  });
  it("offer no passkey to a super admin", async () => {
    m.user.mockResolvedValue({ id: "u1", email: "root@example.test", name: null, isSuperAdmin: true });
    expect(await beginPasskeyRegistration()).toMatchObject({ ok: false, error: "Passkeys are not available for this account." });
    expect(m.begin).not.toHaveBeenCalled();
  });
  it("need a recent sign-in to add or remove, and a valid response shape to finish", async () => {
    m.recent.mockResolvedValue(false);
    expect(await beginPasskeyRegistration()).toMatchObject({ ok: false });
    expect(await removePasskey({ id: "p1" })).toMatchObject({ ok: false });
    m.recent.mockResolvedValue(true);
    expect(await finishPasskeyRegistration({ nonsense: true })).toMatchObject({ ok: false });
    expect(m.finish).not.toHaveBeenCalled();
  });
  it("start a sign-in with user verification required and the challenge kept on the server", async () => {
    expect(await beginPasskeySignIn()).toMatchObject({ ok: true });
    expect(m.options).toHaveBeenCalledWith(expect.objectContaining({ userVerification: "required" }));
    expect(m.save).toHaveBeenCalledWith("c2");
  });
  it("removes only for the signed-in person", async () => {
    m.remove.mockResolvedValue({ ok: true });
    await removePasskey({ id: "p1" });
    expect(m.remove).toHaveBeenCalledWith("u1", "p1", expect.anything());
  });
});
