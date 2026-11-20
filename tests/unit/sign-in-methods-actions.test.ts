import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  requireAuth: vi.fn(), recent: vi.fn(), limited: vi.fn(), setIntent: vi.fn(), linkable: vi.fn(), count: vi.fn(), auditUnlinked: vi.fn(), auditRevoked: vi.fn(),
  userFind: vi.fn(), accountFind: vi.fn(), accountDelete: vi.fn(), sessionFirst: vi.fn(), transaction: vi.fn(), revoke: vi.fn(),
}));
vi.mock("@/lib/permissions", () => ({ requireAuth: m.requireAuth }));
vi.mock("@/lib/reauth", () => ({ hasRecentAuthentication: m.recent }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: m.limited }));
vi.mock("@/lib/linkSession", () => ({ setLinkIntent: m.setIntent }));
vi.mock("@/lib/authMethods/linkable", () => ({ listLinkableMethods: m.linkable }));
vi.mock("@/lib/authMethods/workingMethods", () => ({ countWorkingMethods: m.count }));
vi.mock("@/lib/authAudit", () => ({ auditIdentityUnlinked: m.auditUnlinked, auditSessionRevoked: m.auditRevoked }));
vi.mock("@/lib/userSessions", () => ({ revokeUserSession: m.revoke }));
const tx = { $queryRaw: vi.fn(), account: { deleteMany: m.accountDelete } };
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: m.userFind }, account: { findFirst: m.accountFind }, userSession: { findFirst: m.sessionFirst }, $transaction: m.transaction } }));

import { beginLinkSignInMethod, unlinkSignInMethod } from "@/app/actions/sign-in-methods";
import { revokeSession } from "@/app/actions/sessions";

const google = { provider: "google", label: "Google", kind: "oauth", href: null };

beforeEach(() => {
  vi.clearAllMocks();
  m.requireAuth.mockResolvedValue({ user: { id: "user_1" }, sid: "sid_current" });
  m.recent.mockResolvedValue(true);
  m.limited.mockResolvedValue(false);
  m.userFind.mockResolvedValue({ isSuperAdmin: false });
  m.linkable.mockResolvedValue([google]);
  m.accountFind.mockResolvedValue({ id: "acc_1", provider: "google" });
  m.count.mockResolvedValue(1);
  m.accountDelete.mockResolvedValue({ count: 1 });
  m.transaction.mockImplementation(async (run: (client: typeof tx) => unknown) => run(tx));
  m.sessionFirst.mockResolvedValue({ method: "password" });
  m.revoke.mockResolvedValue(true);
});

describe("beginLinkSignInMethod", () => {
  it("sets a signed intent for this user and the chosen provider", async () => {
    await expect(beginLinkSignInMethod({ provider: "google" })).resolves.toMatchObject({ ok: true, data: { method: google } });
    expect(m.setIntent).toHaveBeenCalledWith({ userId: "user_1", provider: "google" });
  });
  it("needs a recent sign-in", async () => {
    m.recent.mockResolvedValue(false);
    expect((await beginLinkSignInMethod({ provider: "google" })).ok).toBe(false);
    expect(m.setIntent).not.toHaveBeenCalled();
  });
  it("is refused for a super admin, who signs in with a password only", async () => {
    m.userFind.mockResolvedValue({ isSuperAdmin: true });
    expect((await beginLinkSignInMethod({ provider: "google" })).ok).toBe(false);
    expect(m.setIntent).not.toHaveBeenCalled();
  });
  it("is refused for a method that is off or unknown, and for a malformed id", async () => {
    expect((await beginLinkSignInMethod({ provider: "github" })).ok).toBe(false);
    expect((await beginLinkSignInMethod({ provider: "../x" })).ok).toBe(false);
    expect(m.setIntent).not.toHaveBeenCalled();
  });
});

describe("unlinkSignInMethod", () => {
  it("removes the identity when another working method remains, and audits it", async () => {
    await expect(unlinkSignInMethod({ accountId: "acc_1" })).resolves.toEqual({ ok: true });
    expect(m.count).toHaveBeenCalledWith("user_1", { accountId: "acc_1" }, tx);
    expect(m.accountDelete).toHaveBeenCalledWith({ where: { id: "acc_1", userId: "user_1" } });
    expect(m.auditUnlinked).toHaveBeenCalledWith("user_1", "google");
  });
  it("refuses to remove the last working way to sign in", async () => {
    m.count.mockResolvedValue(0);
    const result = await unlinkSignInMethod({ accountId: "acc_1" });
    expect(result).toMatchObject({ ok: false });
    expect(m.accountDelete).not.toHaveBeenCalled();
    expect(m.auditUnlinked).not.toHaveBeenCalled();
  });
  it("only touches the caller's own identities", async () => {
    m.accountFind.mockResolvedValue(null);
    expect((await unlinkSignInMethod({ accountId: "acc_other" })).ok).toBe(false);
    expect(m.accountFind).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "acc_other", userId: "user_1" } }));
    expect(m.accountDelete).not.toHaveBeenCalled();
  });
  it("needs a recent sign-in", async () => {
    m.recent.mockResolvedValue(false);
    expect((await unlinkSignInMethod({ accountId: "acc_1" })).ok).toBe(false);
  });
});

describe("revokeSession", () => {
  it("ends one of the caller's own devices and audits it by method", async () => {
    await expect(revokeSession({ sessionId: "sid_other" })).resolves.toEqual({ ok: true, data: { current: false } });
    expect(m.revoke).toHaveBeenCalledWith("user_1", "sid_other");
    expect(m.auditRevoked).toHaveBeenCalledWith("user_1", "password");
  });
  it("says the browser must sign out when it ended its own session", async () => {
    await expect(revokeSession({ sessionId: "sid_current" })).resolves.toEqual({ ok: true, data: { current: true } });
  });
  it("refuses someone else's session, and writes no audit row", async () => {
    m.sessionFirst.mockResolvedValue(null);
    expect((await revokeSession({ sessionId: "sid_of_another_user" })).ok).toBe(false);
    expect(m.sessionFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "sid_of_another_user", userId: "user_1", revokedAt: null } }));
    expect(m.revoke).not.toHaveBeenCalled();
    expect(m.auditRevoked).not.toHaveBeenCalled();
  });
  it("refuses when the revoke itself finds nothing (a race with another sign-out)", async () => {
    m.revoke.mockResolvedValue(false);
    expect((await revokeSession({ sessionId: "sid_other" })).ok).toBe(false);
    expect(m.auditRevoked).not.toHaveBeenCalled();
  });
});
