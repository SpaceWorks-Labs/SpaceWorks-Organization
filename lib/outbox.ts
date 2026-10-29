import "server-only";

import { OutboxStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { describeOperationalError } from "@/lib/redactSensitiveText";
import { OUTBOX_KINDS, PermanentOutboxError, type OutboxKind } from "@/lib/outboxKinds";

export { PermanentOutboxError };

export type OutboxClient = Prisma.TransactionClient | typeof prisma;

/**
 * Queue an email. The payload is validated again by the kind's handler at send time, so a queued row
 * never reaches a mail server with data it would reject.
 */
export async function enqueueOutbox(client: OutboxClient, kind: OutboxKind, payload: Record<string, unknown>) {
  return client.outboxMessage.create({ data: { kind, payload: payload as Prisma.InputJsonValue } });
}

export async function enqueuePasswordReset(client: OutboxClient, payload: { to: string; resetUrl: string; expiresAt: string }) {
  return enqueueOutbox(client, "password-reset", payload);
}

export async function enqueueEmailVerification(client: OutboxClient, payload: { to: string; verificationUrl: string; expiresAt: string }) {
  return enqueueOutbox(client, "email-verification", payload);
}

function messageId(id: string) {
  return `<swo-${id}@outbox.invalid>`;
}

function retryDelayMs(kind: string, attempts: number) {
  const exponentialDelay = 2 ** attempts * 60_000;
  // One-hour capabilities (reset, verification) retry within their lifetime.
  const maximumDelay = OUTBOX_KINDS[kind as OutboxKind]?.shortLived ? 8 * 60_000 : 60 * 60_000;
  return Math.min(maximumDelay, exponentialDelay);
}

/**
 * Deliver a small batch, or just the rows in `ids` (the queue worker hands over one id at a time).
 * Run this from the worker, never a request path.
 */
export async function deliverOutboxBatch(limit = 20, options: { ids?: string[] } = {}) {
  // A worker may be interrupted after claiming a message. Return a stale claim to the retry queue
  // before processing new work so messages cannot be lost.
  await prisma.outboxMessage.updateMany({
    where: { status: OutboxStatus.PROCESSING, lockedAt: { lt: new Date(Date.now() - 15 * 60_000) } },
    data: { status: OutboxStatus.PENDING, lockedAt: null },
  });

  const messages = await prisma.outboxMessage.findMany({
    where: { status: OutboxStatus.PENDING, availableAt: { lte: new Date() }, ...(options.ids ? { id: { in: options.ids } } : {}) },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(limit, 1), 100),
  });

  let sent = 0;
  let failed = 0;
  for (const message of messages) {
    const claimTime = new Date();
    const claim = await prisma.outboxMessage.updateMany({
      where: { id: message.id, status: OutboxStatus.PENDING },
      data: { status: OutboxStatus.PROCESSING, lockedAt: claimTime, attempts: { increment: 1 } },
    });
    if (claim.count !== 1) continue;
    const claimed = { id: message.id, status: OutboxStatus.PROCESSING, lockedAt: claimTime };
    const handler = OUTBOX_KINDS[message.kind as OutboxKind];

    try {
      if (!handler) throw new PermanentOutboxError();
      const outcome = await handler.deliver(message.payload, messageId(message.id));
      if (outcome === "dropped") {
        // The thing the email was about no longer applies (expired link, revoked card…).
        await prisma.outboxMessage.deleteMany({ where: claimed });
        if (handler.capability) failed += 1;
        continue;
      }
      if (handler.capability) {
        // Capability links (reset, verification, invites) never stay in the database after sending.
        await prisma.outboxMessage.deleteMany({ where: claimed });
      } else {
        await prisma.outboxMessage.updateMany({
          where: claimed,
          data: { status: OutboxStatus.SENT, sentAt: new Date(), lockedAt: null, lastError: null },
        });
      }
      sent += 1;
    } catch (error) {
      const attempts = message.attempts + 1;
      // Durable storage work keeps retrying however often storage fails; only a malformed job is given up.
      const terminal = error instanceof PermanentOutboxError || (!handler?.durable && attempts >= 8);
      if (handler?.capability && terminal) {
        await prisma.outboxMessage.deleteMany({ where: claimed });
      } else {
        await prisma.outboxMessage.updateMany({
          where: claimed,
          data: {
            status: terminal ? OutboxStatus.FAILED : OutboxStatus.PENDING,
            availableAt: new Date(Date.now() + retryDelayMs(message.kind, attempts)),
            lockedAt: null,
            lastError: describeOperationalError(error),
          },
        });
      }
      failed += 1;
    }
  }
  return { sent, failed };
}
