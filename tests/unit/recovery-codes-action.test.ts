import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ requireAuth: vi.fn(), recent: vi.fn(), limited: vi.fn(), consume: vi.fn(), userFind: vi.fn(), updateMany: vi.fn(), auditCreate: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requireAuth: m.requireAuth }));
vi.mock("@/lib/reauth", () => ({ hasRecentAuthentication: m.recent }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: m.limited }));
vi.mock("@/lib/mfa", () => ({ consumeMfaCode: m.consume, decryptMfaSecret: () => "seed", generateRecoveryCodes: () => ["AAAA-1111", "BBBB-2222"], hashRecoveryCode: (code: string) => `hash:${code}` }));
const tx = { $queryRaw: vi.fn(), user: { updateMany: m.updateMany }, auditEvent: { create: m.auditCreate } };
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: m.userFind }, $transaction: async (run: (client: typeof tx) => unknown) => run(tx) } }));

import { regenerateRecoveryCodes } from "@/app/actions/recovery-codes";

beforeEach(() => {
  vi.clearAllMocks();
  m.requireAuth.mockResolvedValue({ user: { id: "user_1", email: "person@example.test" } });
  m.recent.mockResolvedValue(true);
  m.limited.mockResolvedValue(false);
  m.consume.mockResolvedValue(true);
  m.userFind.mockResolvedValue({ mfaSecretEncrypted: "enc" });
  m.updateMany.mockResolvedValue({ count: 1 });
});

describe("regenerating recovery codes", () => {
  it("stores only hashes of a new set, shows the codes once and audits it", async () => {
    await expect(regenerateRecoveryCodes({ code: "123456" })).resolves.toEqual({ ok: true, data: { recoveryCodes: ["AAAA-1111", "BBBB-2222"] } });
    expect(m.updateMany.mock.calls[0][0].data).toEqual({ recoveryCodeHashes: ["hash:AAAA-1111", "hash:BBBB-2222"] });
    expect(m.auditCreate.mock.calls[0][0].data).toMatchObject({ action: "RECOVERY_CODES_REGENERATED", actorUserId: "user_1" });
  });
  it("needs a valid authenticator code, not a recovery code", async () => {
    expect((await regenerateRecoveryCodes({ code: "AAAA-1111" })).ok).toBe(false);
    m.consume.mockResolvedValue(false);
    expect((await regenerateRecoveryCodes({ code: "123456" })).ok).toBe(false);
    expect(m.updateMany).not.toHaveBeenCalled();
  });
  it("needs a recent sign-in and an authenticator that is on", async () => {
    m.recent.mockResolvedValue(false);
    expect((await regenerateRecoveryCodes({ code: "123456" })).ok).toBe(false);
    m.recent.mockResolvedValue(true);
    m.userFind.mockResolvedValue({ mfaSecretEncrypted: null });
    expect((await regenerateRecoveryCodes({ code: "123456" })).ok).toBe(false);
    expect(m.updateMany).not.toHaveBeenCalled();
  });
});
