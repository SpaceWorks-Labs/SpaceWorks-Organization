import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { INVITE_COOKIE_TTL_MS, inviteReturnPath, invitePath, signInviteCookie, verifyInviteCookie } from "@/lib/inviteLink";

const token = "AbC_123-".repeat(4);
const original = process.env.AUTH_SECRET;
beforeEach(() => { process.env.AUTH_SECRET = "s".repeat(40); });
afterEach(() => { process.env.AUTH_SECRET = original; });

describe("invite sign-up cookie", () => {
  it("round-trips the invite token", () => {
    expect(verifyInviteCookie(signInviteCookie(token))).toBe(token);
  });

  it("expires after 30 minutes", () => {
    const now = Date.now();
    const value = signInviteCookie(token, now);
    expect(verifyInviteCookie(value, now + INVITE_COOKIE_TTL_MS - 1)).toBe(token);
    expect(verifyInviteCookie(value, now + INVITE_COOKIE_TTL_MS)).toBeNull();
    expect(INVITE_COOKIE_TTL_MS).toBe(30 * 60 * 1000);
  });

  it("rejects a tampered token, expiry or signature", () => {
    const [t, exp, sig] = signInviteCookie(token).split(".");
    const other = "Z".repeat(24);
    expect(verifyInviteCookie(`${other}.${exp}.${sig}`)).toBeNull();
    expect(verifyInviteCookie(`${t}.${Number(exp) + 60_000}.${sig}`)).toBeNull();
    expect(verifyInviteCookie(`${t}.${exp}.${sig.slice(0, -2)}xx`)).toBeNull();
    expect(verifyInviteCookie(`${t}.${exp}.`)).toBeNull();
  });

  it("rejects a cookie signed with another secret", () => {
    const value = signInviteCookie(token);
    process.env.AUTH_SECRET = "o".repeat(40);
    expect(verifyInviteCookie(value)).toBeNull();
  });

  it("rejects missing and malformed values", () => {
    for (const value of [undefined, "", "a.b", "a.b.c.d", `${token}.notanumber.sig`]) expect(verifyInviteCookie(value)).toBeNull();
  });
});

describe("invite return path", () => {
  it("accepts a staff invite page on this site", () => {
    expect(inviteReturnPath(invitePath(token))).toBe(`/join/org/${token}`);
  });

  it.each([
    "https://evil.example/join/org/" + "a".repeat(24),
    "//evil.example/join/org/" + "a".repeat(24),
    "/join/org/short",
    "/join/org/" + "a".repeat(24) + "/extra",
    "/join/org/" + "a".repeat(24) + "?x=1",
    "/join/org/" + "a".repeat(24) + "#frag",
    "/join/org/../../dashboard",
    "/dashboard",
    "/join/org/" + "a".repeat(257),
    "",
    null,
    undefined,
  ])("rejects %s", (value) => {
    expect(inviteReturnPath(value)).toBeNull();
  });
});
