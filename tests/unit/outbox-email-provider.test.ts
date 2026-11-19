import { beforeEach, describe, expect, it, vi } from "vitest";
import { OutboxStatus } from "@prisma/client";

const mocks = vi.hoisted(() => ({ updateMany: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), notice: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { outboxMessage: { updateMany: mocks.updateMany, findMany: mocks.findMany, deleteMany: mocks.deleteMany }, emailSuppression: { count: vi.fn() } } }));
vi.mock("@/lib/email/organisation", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/email/organisation")>()), deliverOrganisationNotice: mocks.notice }));

import { deliverOutboxBatch } from "@/lib/outbox";
import { EmailProviderError } from "@/lib/email/providers/types";
import { EmailSuppressedError } from "@/lib/email/suppression";
import { EmailRecipientRejectedError } from "@/lib/email/transporter";

const row = { id: "msg_1", kind: "organisation-notice", payload: { to: "a@example.test", organisationId: "org_1", notice: "approved" }, status: OutboxStatus.PENDING, attempts: 0, availableAt: new Date(), lockedAt: null, sentAt: null, lastError: null, createdAt: new Date() };

describe("outbox delivery through an email provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.findMany.mockResolvedValue([row]);
  });

  it("marks an accepted message sent and never offers it again", async () => {
    mocks.notice.mockResolvedValue("sent");
    await expect(deliverOutboxBatch()).resolves.toEqual({ sent: 1, failed: 0 });
    expect(mocks.updateMany).toHaveBeenLastCalledWith({ where: expect.objectContaining({ id: "msg_1" }), data: expect.objectContaining({ status: OutboxStatus.SENT }) });
    // The provider key derives from the row id, so a retry after a crash reuses it.
    expect(mocks.notice).toHaveBeenCalledWith(expect.anything(), "<swo-msg_1@outbox.invalid>");
  });

  it.each([new EmailSuppressedError(), new EmailRecipientRejectedError()])("fails a send the provider can never take at once (%s), with an honest reason", async (error) => {
    mocks.notice.mockRejectedValue(error);
    await expect(deliverOutboxBatch()).resolves.toEqual({ sent: 0, failed: 1 });
    expect(mocks.updateMany).toHaveBeenLastCalledWith({ where: expect.anything(), data: expect.objectContaining({ status: OutboxStatus.FAILED, lastError: expect.any(String) }) });
  });

  it("retries a provider outage later", async () => {
    mocks.notice.mockRejectedValue(new EmailProviderError("busy", true, 503));
    await deliverOutboxBatch();
    expect(mocks.updateMany).toHaveBeenLastCalledWith({ where: expect.anything(), data: expect.objectContaining({ status: OutboxStatus.PENDING }) });
  });
});
