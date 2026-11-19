import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ record: vi.fn(), throttled: vi.fn() }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: m.record, recordThrottledAuditEvent: m.throttled }));

import { auditIdentityLinked, auditIdentityUnlinked, auditRecoveryCodeUsed, auditSignedOut, auditSignInFailed, auditSignInSucceeded, methodOfProvider } from "@/lib/authAudit";

beforeEach(() => { vi.clearAllMocks(); m.record.mockResolvedValue({}); m.throttled.mockResolvedValue({}); });

describe("sign-in audit rows", () => {
  it("records success with the method, and the password form as password", async () => {
    await auditSignInSucceeded("u1", "credentials");
    await auditSignInSucceeded("u1", "oidc-work");
    expect(m.record).toHaveBeenNthCalledWith(1, expect.objectContaining({ action: "SIGN_IN_SUCCEEDED", actorUserId: "u1", metadata: { method: "password" } }));
    expect(m.record).toHaveBeenNthCalledWith(2, expect.objectContaining({ metadata: { method: "oidc-work" } }));
    expect(methodOfProvider("google")).toBe("google");
  });
  it("records a failure as method and reason only, with no actor, address or credential", async () => {
    await auditSignInFailed("credentials", "bad_credentials");
    const event = m.throttled.mock.calls[0][0];
    expect(event).toMatchObject({ action: "SIGN_IN_FAILED", actorUserId: null, metadata: { method: "password", reason: "bad_credentials" } });
    expect(Object.keys(event.metadata).sort()).toEqual(["method", "reason"]);
  });
  it("records sign-out, recovery code use and identity link and unlink", async () => {
    await auditSignedOut("u1");
    await auditRecoveryCodeUsed("u1");
    await auditIdentityLinked("u1", "github");
    await auditIdentityUnlinked("u1", "github");
    expect(m.record.mock.calls.map(([event]) => event.action)).toEqual(["SIGN_OUT", "RECOVERY_CODE_USED", "IDENTITY_LINKED", "IDENTITY_UNLINKED"]);
  });
  it("never breaks a sign-in when the audit write fails", async () => {
    m.record.mockRejectedValue(new Error("db down"));
    m.throttled.mockRejectedValue(new Error("db down"));
    await expect(auditSignInSucceeded("u1", "credentials")).resolves.toBeUndefined();
    await expect(auditSignInFailed("credentials", "x")).resolves.toBeUndefined();
  });
});
