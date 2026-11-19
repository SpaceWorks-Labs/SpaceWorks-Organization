import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OutboxStatus } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  verification: vi.fn(),
  session: vi.fn(),
  teamInvite: vi.fn(),
  outbox: vi.fn(),
  smsCode: vi.fn(),
  passkeyChallenge: vi.fn(),
  samlLoginState: vi.fn(),
  userSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: {
  $transaction: mocks.transaction,
  verificationToken: { deleteMany: mocks.verification },
  session: { deleteMany: mocks.session },
  teamInvite: { deleteMany: mocks.teamInvite },
  outboxMessage: { deleteMany: mocks.outbox },
  smsCode: { deleteMany: mocks.smsCode },
  passkeyChallenge: { deleteMany: mocks.passkeyChallenge },
  samlLoginState: { deleteMany: mocks.samlLoginState },
  userSession: { deleteMany: mocks.userSession },
} }));

import { purgeExpiredOperationalData } from "@/lib/retention";

const previousRetention = process.env.OUTBOX_RETENTION_DAYS;

describe("operational retention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OUTBOX_RETENTION_DAYS = "30";
    for (const mock of [mocks.verification, mocks.session, mocks.teamInvite, mocks.outbox, mocks.smsCode, mocks.passkeyChallenge, mocks.samlLoginState, mocks.userSession]) {
      mock.mockResolvedValue({ count: 1 });
    }
    mocks.transaction.mockImplementation((operations: Array<Promise<unknown>>) => Promise.all(operations));
  });

  afterEach(() => {
    if (previousRetention === undefined) delete process.env.OUTBOX_RETENTION_DAYS;
    else process.env.OUTBOX_RETENTION_DAYS = previousRetention;
  });

  it("purges expired capabilities/sessions and both sent and failed queue history", async () => {
    const now = new Date("2030-03-01T00:00:00.000Z");
    await expect(purgeExpiredOperationalData(now)).resolves.toEqual({
      verificationTokens: 1,
      expiredSessions: 1,
      unusedTeamInvites: 1,
      sentOutboxMessages: 1,
      failedOutboxMessages: 1,
      smsCodes: 1,
      passkeyChallenges: 1,
      samlLoginStates: 1,
      userSessions: 1,
    });
    expect(mocks.smsCode).toHaveBeenCalledWith({ where: { createdAt: { lt: new Date("2030-02-27T00:00:00.000Z") } } });
    expect(mocks.teamInvite).toHaveBeenCalledWith({ where: { usedAt: null, expiresAt: { lt: now } } });
    expect(mocks.outbox).toHaveBeenNthCalledWith(1, { where: { status: OutboxStatus.SENT, sentAt: { lt: new Date("2030-01-30T00:00:00.000Z") } } });
    expect(mocks.outbox).toHaveBeenNthCalledWith(2, { where: { status: OutboxStatus.FAILED, createdAt: { lt: new Date("2030-01-30T00:00:00.000Z") } } });
  });
});
