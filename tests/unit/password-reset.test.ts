import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));
const rateLimitMock = vi.hoisted(() => vi.fn());
const enqueueResetMock = vi.hoisted(() => vi.fn());
const bcryptMock = vi.hoisted(() => ({ hash: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: rateLimitMock }));
const emailMock = vi.hoisted(() => ({ configured: true }));
vi.mock("@/lib/emailAvailability", () => ({ isEmailServiceConfigured: async () => emailMock.configured }));
vi.mock("@/lib/ipBlock", () => ({ currentRequestBlocked: async () => false }));
vi.mock("@/lib/outbox", () => ({ enqueuePasswordReset: enqueueResetMock }));
vi.mock("bcryptjs", () => ({ default: bcryptMock }));

import { confirmPasswordReset, requestPasswordReset } from "@/app/actions/password-reset";

const tx = {
  $queryRaw: vi.fn(),
  verificationToken: {
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
  // A super admin is never reset by email; the test user isn't one.
  user: { update: vi.fn(), findUnique: vi.fn(async () => ({ isSuperAdmin: false })) },
  session: { deleteMany: vi.fn() },
  auditEvent: { create: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";
  rateLimitMock.mockResolvedValue(false);
  prismaMock.user.findUnique.mockResolvedValue({ id: "user_1", passwordHash: "hash" });
  prismaMock.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<void>) => callback(tx));
  tx.user.update.mockResolvedValue({ id: "user_1" });
  tx.verificationToken.deleteMany.mockResolvedValue({ count: 0 });
  tx.verificationToken.create.mockResolvedValue({});
  enqueueResetMock.mockResolvedValue(undefined);
  bcryptMock.hash.mockResolvedValue("new-password-hash");
});

describe("confirmPasswordReset", () => {
  it("atomically consumes the exact unexpired token before changing credentials", async () => {
    tx.verificationToken.deleteMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(confirmPasswordReset({
      email: "person@example.com",
      token: "a".repeat(64),
      password: "new-password",
    })).resolves.toEqual({ ok: true, data: { reset: true } });

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { email: "person@example.com" },
      data: { passwordHash: "new-password-hash", emailVerified: expect.any(Date), sessionVersion: { increment: 1 } },
      select: { id: true },
    });
  });

  it("does not update a user when the token was already consumed", async () => {
    tx.verificationToken.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(confirmPasswordReset({
      email: "person@example.com",
      token: "a".repeat(64),
      password: "new-password",
    })).resolves.toEqual({ ok: false, error: "Invalid or expired reset link." });
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});

describe("requestPasswordReset without an email service", () => {
  it("refuses with a clear message and sends nothing", async () => {
    emailMock.configured = false;
    try {
      await expect(requestPasswordReset({ email: "person@example.com" })).resolves.toMatchObject({ ok: false, error: expect.stringContaining("isn't set up") });
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
      expect(enqueueResetMock).not.toHaveBeenCalled();
    } finally {
      emailMock.configured = true;
    }
  });
});

describe("requestPasswordReset", () => {
  it("atomically queues a reset link with its one-time token", async () => {
    await expect(requestPasswordReset({ email: "person@example.com" })).resolves.toEqual({
      ok: true,
      data: { sent: true },
    });

    expect(tx.verificationToken.create).toHaveBeenCalledTimes(1);
    expect(enqueueResetMock).toHaveBeenCalledWith(tx, {
      to: "person@example.com",
      resetUrl: expect.stringMatching(/^http:\/\/localhost:3000\/reset-password\?token=[a-f0-9]{64}&email=person%40example\.com$/),
      expiresAt: expect.any(String),
    });
    expect(enqueueResetMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      tx.verificationToken.create.mock.invocationCallOrder[0],
    );
  });
});
