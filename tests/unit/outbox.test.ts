import { beforeEach, describe, expect, it, vi } from "vitest";
import { OutboxStatus } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  findMany: vi.fn(),
  deleteMany: vi.fn(),
  passwordReset: vi.fn(),
  verification: vi.fn(),
  notice: vi.fn(),
  adminAlert: vi.fn(),
  ownerInvite: vi.fn(),
  photoPurge: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: { outboxMessage: {
  updateMany: mocks.updateMany,
  findMany: mocks.findMany,
  deleteMany: mocks.deleteMany,
} } }));
vi.mock("@/lib/storage/memberPhotos", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage/memberPhotos")>()),
  purgeErasedMemberPhotos: mocks.photoPurge,
}));
vi.mock("@/lib/email/passwordReset", () => ({ sendPasswordResetEmail: mocks.passwordReset }));
vi.mock("@/lib/email/emailVerification", () => ({ sendEmailVerificationEmail: mocks.verification }));
vi.mock("@/lib/email/organisation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/organisation")>()),
  deliverOrganisationNotice: mocks.notice,
  deliverAdminApplicationAlert: mocks.adminAlert,
  deliverOwnerInvite: mocks.ownerInvite,
}));

import { deliverOutboxBatch } from "@/lib/outbox";

function message(overrides: Record<string, unknown>) {
  return {
    id: "msg_1",
    kind: "organisation-notice",
    payload: {},
    status: OutboxStatus.PENDING,
    attempts: 0,
    availableAt: new Date(),
    lockedAt: null,
    sentAt: null,
    lastError: null,
    createdAt: new Date("2030-01-01T00:00:00Z"),
    ...overrides,
  };
}

const invitePayload = { to: "owner@example.test", organisationId: "org_1", token: "invite-secret", expiresAt: "2035-01-01T00:00:00.000Z" };
const claimedWhere = expect.objectContaining({ id: "msg_1", status: OutboxStatus.PROCESSING, lockedAt: expect.any(Date) });

describe("outbox delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // stale-claim recovery, then per-message claim/finalization
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    for (const deliver of [mocks.notice, mocks.adminAlert, mocks.ownerInvite]) deliver.mockResolvedValue("sent");
  });

  it("deletes invite rows immediately after delivery and reuses a stable Message-ID", async () => {
    mocks.findMany.mockResolvedValue([message({ kind: "owner-invite", payload: invitePayload })]);

    await expect(deliverOutboxBatch()).resolves.toEqual({ sent: 1, failed: 0 });
    expect(mocks.ownerInvite).toHaveBeenCalledWith(expect.objectContaining({ token: "invite-secret" }), "<swo-msg_1@outbox.invalid>");
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: claimedWhere });
    expect(mocks.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: OutboxStatus.SENT }) }));
  });

  it("keeps a sent lifecycle notice as history without any capability", async () => {
    mocks.findMany.mockResolvedValue([message({ payload: { to: "owner@example.test", organisationId: "org_1", notice: "approved" } })]);

    await expect(deliverOutboxBatch()).resolves.toEqual({ sent: 1, failed: 0 });
    expect(mocks.updateMany).toHaveBeenLastCalledWith({ where: claimedWhere, data: expect.objectContaining({ status: OutboxStatus.SENT, lockedAt: null }) });
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes a notice whose organisation is gone instead of counting it as failed", async () => {
    mocks.notice.mockResolvedValue("dropped");
    mocks.findMany.mockResolvedValue([message({ payload: { to: "owner@example.test", organisationId: "gone", notice: "received" } })]);

    await expect(deliverOutboxBatch()).resolves.toEqual({ sent: 0, failed: 0 });
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: claimedWhere });
  });

  it("deletes a terminal capability failure instead of retaining its payload", async () => {
    mocks.ownerInvite.mockRejectedValue(Object.assign(new Error("owner@example.test invite-secret"), { code: "ECONNRESET" }));
    mocks.findMany.mockResolvedValue([message({ kind: "owner-invite", attempts: 7, payload: invitePayload })]);

    await expect(deliverOutboxBatch()).resolves.toEqual({ sent: 0, failed: 1 });
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: expect.objectContaining({ id: "msg_1", status: OutboxStatus.PROCESSING }) });
  });

  it("keeps retrying an erased member's photo purge however often storage fails", async () => {
    mocks.photoPurge.mockRejectedValue(Object.assign(new Error("storage down"), { code: "ECONNREFUSED" }));
    mocks.findMany.mockResolvedValue([message({ kind: "member-photo-purge", attempts: 20, payload: { organisationId: "org_1", memberId: "mem_1", keys: [] } })]);

    await expect(deliverOutboxBatch()).resolves.toEqual({ sent: 0, failed: 1 });
    expect(mocks.updateMany).toHaveBeenLastCalledWith({ where: claimedWhere, data: expect.objectContaining({ status: OutboxStatus.PENDING }) });
  });

  it("stores only bounded failure metadata and releases the claim for a retry", async () => {
    mocks.notice.mockRejectedValue(Object.assign(new Error("private@example.test reviewer-note"), { code: "ETIMEDOUT" }));
    mocks.findMany.mockResolvedValue([message({ payload: { to: "private@example.test", organisationId: "org_1", notice: "rejected", reason: "reviewer-note" } })]);

    await expect(deliverOutboxBatch()).resolves.toEqual({ sent: 0, failed: 1 });
    expect(mocks.updateMany).toHaveBeenLastCalledWith({
      where: claimedWhere,
      data: expect.objectContaining({ status: OutboxStatus.PENDING, lockedAt: null, lastError: "Error (ETIMEDOUT)" }),
    });
    expect(JSON.stringify(mocks.updateMany.mock.calls)).not.toContain("private@example.test");
    expect(JSON.stringify(mocks.updateMany.mock.calls)).not.toContain("reviewer-note");
  });

  it("keeps authentication-email retries within the one-hour capability lifetime", async () => {
    vi.useFakeTimers();
    try {
      const now = new Date("2030-01-01T00:00:00.000Z");
      vi.setSystemTime(now);
      mocks.verification.mockRejectedValue(Object.assign(new Error("temporary SMTP failure"), { code: "ETIMEDOUT" }));
      mocks.findMany.mockResolvedValue([message({
        kind: "email-verification",
        attempts: 4,
        payload: {
          to: "person@example.test",
          verificationUrl: "https://members.test/verify-email?token=secret",
          expiresAt: "2030-01-01T01:00:00.000Z",
        },
      })]);

      await expect(deliverOutboxBatch()).resolves.toEqual({ sent: 0, failed: 1 });
      expect(mocks.updateMany).toHaveBeenLastCalledWith({
        where: claimedWhere,
        data: expect.objectContaining({
          status: OutboxStatus.PENDING,
          availableAt: new Date("2030-01-01T00:08:00.000Z"),
          lockedAt: null,
        }),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops an expired password reset without attempting delivery", async () => {
    mocks.findMany.mockResolvedValue([message({
      kind: "password-reset",
      payload: { to: "person@example.test", resetUrl: "https://members.test/reset-password?token=secret", expiresAt: "2020-01-01T00:00:00.000Z" },
    })]);

    await expect(deliverOutboxBatch()).resolves.toEqual({ sent: 0, failed: 1 });
    expect(mocks.passwordReset).not.toHaveBeenCalled();
    expect(mocks.deleteMany).toHaveBeenCalled();
  });

  it("quarantines a poison non-capability payload without retrying it eight times", async () => {
    mocks.findMany.mockResolvedValue([message({ payload: { unexpected: "shape" } })]);
    await expect(deliverOutboxBatch()).resolves.toEqual({ sent: 0, failed: 1 });
    expect(mocks.notice).not.toHaveBeenCalled();
    expect(mocks.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({ id: "msg_1", status: OutboxStatus.PROCESSING }),
      data: expect.objectContaining({ status: OutboxStatus.FAILED, lockedAt: null, lastError: "PermanentOutboxError" }),
    });
  });

  it("fails an unknown kind permanently", async () => {
    mocks.findMany.mockResolvedValue([message({ kind: "rsvp-confirmation", payload: { to: "a@example.test" } })]);
    await expect(deliverOutboxBatch()).resolves.toEqual({ sent: 0, failed: 1 });
    expect(mocks.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({ id: "msg_1" }),
      data: expect.objectContaining({ status: OutboxStatus.FAILED, lastError: "PermanentOutboxError" }),
    });
  });

  it("skips a message another worker already claimed", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 0 });
    mocks.findMany.mockResolvedValue([message({ payload: { to: "owner@example.test", organisationId: "org_1", notice: "approved" } })]);
    await expect(deliverOutboxBatch()).resolves.toEqual({ sent: 0, failed: 0 });
    expect(mocks.notice).not.toHaveBeenCalled();
  });
});
