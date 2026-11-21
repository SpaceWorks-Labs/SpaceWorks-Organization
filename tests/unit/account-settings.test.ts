import { describe, expect, it } from "vitest";
import { ACCOUNT_TABS, isAccountTabActive } from "@/components/account/accountTabs";
import {
  SECURITY_ACTIVITY_ACTIONS,
  formatMemberSince,
  securityActivityLabel,
  signInProviderLabel,
} from "@/lib/accountSecurity";

describe("account tabs", () => {
  it("lists the account tabs in order", () => {
    expect(ACCOUNT_TABS.map((tab) => tab.href)).toEqual(["/account", "/account/payments", "/account/certificates", "/account/profile", "/account/privacy", "/account/organisations", "/account/notifications", "/account/security"]);
  });

  it("matches the root tab exactly", () => {
    expect(isAccountTabActive("/account", "/account")).toBe(true);
    expect(isAccountTabActive("/account/", "/account")).toBe(true);
    expect(isAccountTabActive("/account/security", "/account")).toBe(false);
  });

  it("matches nested paths for other tabs without prefix collisions", () => {
    expect(isAccountTabActive("/account/security", "/account/security")).toBe(true);
    expect(isAccountTabActive("/account/security/devices", "/account/security")).toBe(true);
    expect(isAccountTabActive("/account/security-keys", "/account/security")).toBe(false);
    expect(isAccountTabActive(null, "/account/security")).toBe(false);
  });

  it("keeps exactly one tab active per account path", () => {
    for (const path of ["/account", "/account/memberships/spaceworks", "/account/pay/term_1", "/account/privacy", "/account/security", "/account/security/x"]) {
      expect(ACCOUNT_TABS.filter((tab) => isAccountTabActive(path, tab.href))).toHaveLength(1);
    }
  });
});

describe("security activity labels", () => {
  it("labels every recorded security action", () => {
    expect(SECURITY_ACTIVITY_ACTIONS).toEqual(
      expect.arrayContaining(["MFA_ENABLED", "MFA_DISABLED", "ACCOUNT_PASSWORD_CHANGED", "ACCOUNT_PASSWORD_ADDED", "ACCOUNT_PASSWORD_RESET", "SESSIONS_REVOKED"]),
    );
    for (const action of SECURITY_ACTIVITY_ACTIONS) expect(securityActivityLabel(action)).not.toBe("Security change");
    expect(securityActivityLabel("SESSIONS_REVOKED")).toBe("Signed out everywhere");
  });

  it("falls back to a generic label and ignores prototype keys", () => {
    expect(securityActivityLabel("SOMETHING_NEW")).toBe("Security change");
    expect(securityActivityLabel("toString")).toBe("Security change");
  });

  it("does not include non-security events", () => {
    expect(SECURITY_ACTIVITY_ACTIONS).not.toContain("ACCOUNT_PROFILE_UPDATED");
  });
});

describe("sign-in provider labels", () => {
  it("names known and unknown providers", () => {
    expect(signInProviderLabel("google")).toBe("Google");
    expect(signInProviderLabel("microsoft-entra-id")).toBe("Microsoft entra id");
    expect(signInProviderLabel("")).toBe("Single sign-on");
  });
});

describe("member since", () => {
  it("formats in UTC", () => {
    expect(formatMemberSince(new Date("2026-10-14T23:30:00.000Z"))).toBe("14 Oct 2026");
  });
});
