import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(),
  known: vi.fn(), target: vi.fn(), headers: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: { userSession: { create: m.create, findUnique: m.findUnique, findFirst: m.findFirst, findMany: m.findMany, updateMany: m.updateMany, deleteMany: m.deleteMany } } }));
vi.mock("@/lib/loginSecurity", () => ({ recognisedDevice: m.known, deviceLabel: (ua: string | null) => (ua?.includes("Firefox") ? "Firefox on Linux" : "A browser") }));
vi.mock("@/lib/linkSession", () => ({ activeLinkTarget: m.target }));
vi.mock("next/headers", () => ({ headers: m.headers }));

import { LAST_SEEN_EVERY_MS, checkUserSession, ipPrefix, listUserSessions, revokeAllUserSessions, revokeUserSession, sessionMethod, startUserSession } from "@/lib/userSessions";

const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);
const row = (over: object = {}) => ({ userId: "user_1", revokedAt: null, lastSeenAt: new Date(NOW - 1000), sessionVersion: 3, user: { sessionVersion: 3 }, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  m.create.mockResolvedValue({ id: "sid_new" });
  m.deleteMany.mockResolvedValue({ count: 0 });
  m.updateMany.mockResolvedValue({ count: 1 });
  m.known.mockResolvedValue({ id: "device_1" });
  m.target.mockResolvedValue(null);
  m.headers.mockResolvedValue(new Headers({ "user-agent": "Mozilla Firefox/130", "x-real-ip": "203.0.113.77" }));
});

describe("starting a session", () => {
  it("creates a row with a device label, a shortened address, the method and the known device", async () => {
    expect(await startUserSession("user_1", 3, "google")).toBe("sid_new");
    const data = m.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ userId: "user_1", sessionVersion: 3, userAgent: "Firefox on Linux", method: "google", knownDeviceId: "device_1" });
    expect(JSON.stringify(data)).not.toContain("Mozilla");
    expect(data.ipPrefix === null || !String(data.ipPrefix).includes("77")).toBe(true);
  });

  it("keeps this browser's own session while a method is being linked, and starts none", async () => {
    m.target.mockResolvedValue({ userId: "user_1", sid: "sid_existing" });
    expect(await startUserSession("user_1", 3, "google")).toBe("sid_existing");
    expect(m.create).not.toHaveBeenCalled();
  });

  it("does not reuse another user's session for a link", async () => {
    m.target.mockResolvedValue({ userId: "user_2", sid: "sid_other" });
    expect(await startUserSession("user_1", 3, "google")).toBe("sid_new");
  });
});

describe("checking a session on every request", () => {
  it("accepts a live row of this user and returns the user's version", async () => {
    m.findUnique.mockResolvedValue(row());
    expect(await checkUserSession("sid_1", "user_1", NOW)).toBe(3);
    expect(m.findUnique).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["no session id", undefined, null],
    ["a missing row", "sid_1", null],
    ["a revoked row", "sid_1", row({ revokedAt: new Date() })],
    ["another user's row", "sid_1", row({ userId: "user_2" })],
    ["a row from before a password reset or sign-out-everywhere", "sid_1", row({ sessionVersion: 2 })],
  ])("signs out for %s", async (_name, sid, found) => {
    m.findUnique.mockResolvedValue(found);
    expect(await checkUserSession(sid as string | undefined, "user_1", NOW)).toBeNull();
  });

  it("writes lastSeenAt at most once every five minutes", async () => {
    m.findUnique.mockResolvedValue(row({ lastSeenAt: new Date(NOW - LAST_SEEN_EVERY_MS + 1000) }));
    await checkUserSession("sid_1", "user_1", NOW);
    expect(m.updateMany).not.toHaveBeenCalled();
    m.findUnique.mockResolvedValue(row({ lastSeenAt: new Date(NOW - LAST_SEEN_EVERY_MS) }));
    await checkUserSession("sid_1", "user_1", NOW);
    expect(m.updateMany).toHaveBeenCalledWith({ where: { id: "sid_1", revokedAt: null }, data: { lastSeenAt: new Date(NOW) } });
  });
});

describe("listing and revoking", () => {
  it("lists live sessions of the current version and marks this device", async () => {
    m.findMany.mockResolvedValue([
      { id: "a", createdAt: new Date(NOW), lastSeenAt: new Date(NOW), userAgent: "Chrome on Windows", ipPrefix: "203.0", method: "password" },
      { id: "b", createdAt: new Date(NOW), lastSeenAt: new Date(NOW), userAgent: "", ipPrefix: null, method: "google" },
    ]);
    const list = await listUserSessions("user_1", 3, "b");
    expect(m.findMany.mock.calls[0][0].where).toMatchObject({ userId: "user_1", revokedAt: null, sessionVersion: 3 });
    expect(list.map((item) => [item.id, item.current, item.label])).toEqual([["a", false, "Chrome on Windows"], ["b", true, "A browser"]]);
  });

  it("revokes only the named user's own live row", async () => {
    expect(await revokeUserSession("user_1", "sid_1")).toBe(true);
    expect(m.updateMany).toHaveBeenCalledWith({ where: { id: "sid_1", userId: "user_1", revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    m.updateMany.mockResolvedValue({ count: 0 });
    expect(await revokeUserSession("user_2", "sid_1")).toBe(false);
  });

  it("revokes every live row of a user", async () => {
    await revokeAllUserSessions("user_1");
    expect(m.updateMany).toHaveBeenCalledWith({ where: { userId: "user_1", revokedAt: null }, data: { revokedAt: expect.any(Date) } });
  });
});

describe("helpers", () => {
  it("shortens addresses to a prefix", () => {
    expect(ipPrefix("203.0.113.77")).toBe("203.0");
    expect(ipPrefix("2001:db8:85a3:0:0:8a2e:370:7334")).toBe("2001:db8:85a3");
    expect(ipPrefix("2001:db8::1")).toBe("2001:db8:0");
    expect(ipPrefix("unknown")).toBeNull();
    expect(ipPrefix(null)).toBeNull();
  });
  it("names the method from the Auth.js provider id", () => {
    expect([undefined, "credentials", "google", "oidc-work", "saml", "supabase", "passkey", "weird"].map(sessionMethod))
      .toEqual(["password", "password", "google", "oidc", "saml", "supabase", "passkey", "password"]);
  });
});
