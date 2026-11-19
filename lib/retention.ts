import "server-only";

import { OutboxStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Remove expired operational records without deleting business/audit data. */
export async function purgeExpiredOperationalData(now = new Date()) {
  const outboxRetentionDays = Math.min(
    Math.max(Number(process.env.OUTBOX_RETENTION_DAYS || 30), 1),
    365,
  );
  const sentBefore = new Date(now.getTime() - outboxRetentionDays * DAY_MS);
  const idleBefore = new Date(now.getTime() - 90 * DAY_MS);
  const [tokens, sessions, teamInvites, sentMessages, failedMessages, smsCodes, passkeyChallenges, samlStates, userSessions] = await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { expires: { lt: now } } }),
    prisma.session.deleteMany({ where: { expires: { lt: now } } }),
    prisma.teamInvite.deleteMany({ where: { usedAt: null, expiresAt: { lt: now } } }),
    prisma.outboxMessage.deleteMany({
      where: { status: OutboxStatus.SENT, sentAt: { lt: sentBefore } },
    }),
    prisma.outboxMessage.deleteMany({
      where: { status: OutboxStatus.FAILED, createdAt: { lt: sentBefore } },
    }),
    // Phone-code records double as the send log the limits count; nothing looks back further than a day.
    prisma.smsCode.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 2 * DAY_MS) } } }),
    // Single-use sign-in state (passkey challenges, SAML requests, tickets and replay ids) past its expiry.
    prisma.passkeyChallenge.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.samlLoginState.deleteMany({ where: { expiresAt: { lt: now } } }),
    // Session records revoked or unused for 90 days: they can no longer sign anyone in.
    prisma.userSession.deleteMany({ where: { OR: [{ revokedAt: { lt: idleBefore } }, { lastSeenAt: { lt: idleBefore } }] } }),
  ]);
  return {
    smsCodes: smsCodes.count,
    passkeyChallenges: passkeyChallenges.count,
    samlLoginStates: samlStates.count,
    userSessions: userSessions.count,
    verificationTokens: tokens.count,
    expiredSessions: sessions.count,
    unusedTeamInvites: teamInvites.count,
    sentOutboxMessages: sentMessages.count,
    failedOutboxMessages: failedMessages.count,
  };
}
