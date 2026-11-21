import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  ageSeconds, chatAlertRollup, chatChannelHealth, emailRollup, heartbeatStatuses, memberMessageRollup, outboxRollup, signInRollup, smsCodeRollup,
  type OpsWindow, type OutboxGroup,
} from "./platformOps";

type Span = { from: Date; to: Date };
const num = (value: bigint | number) => Number(value);

/** Outbox messages created in the window by day, kind and status. Counts only: the payload is never read. */
async function outboxGroups({ from, to }: Span): Promise<OutboxGroup[]> {
  const rows = await prisma.$queryRaw<Array<{ day: Date; kind: string; status: OutboxGroup["status"]; retrying: boolean; n: bigint }>>(Prisma.sql`
    SELECT date_trunc('day', "createdAt") AS day, "kind", "status"::text AS status, ("attempts" > 0) AS retrying, count(*) AS n
    FROM "OutboxMessage" WHERE "createdAt" >= ${from} AND "createdAt" < ${to} GROUP BY 1, 2, 3, 4`);
  return rows.map((row) => ({ day: row.day, kind: row.kind, status: row.status, retrying: row.retrying, count: num(row.n) }));
}

const suppressionGroups = ({ from, to }: Span) =>
  prisma.$queryRaw<Array<{ day: Date; reason: "BOUNCE" | "COMPLAINT"; n: bigint }>>(Prisma.sql`
    SELECT date_trunc('day', "createdAt") AS day, "reason"::text AS reason, count(*) AS n FROM "EmailSuppression"
    WHERE "createdAt" >= ${from} AND "createdAt" < ${to} GROUP BY 1, 2`).then((rows) => rows.map((row) => ({ day: row.day, reason: row.reason, count: num(row.n) })));

const memberMessageGroups = ({ from, to }: Span) =>
  prisma.$queryRaw<Array<{ day: Date; channel: string | null; status: string; n: bigint }>>(Prisma.sql`
    SELECT date_trunc('day', "createdAt") AS day, "channel", "status", count(*) AS n FROM "MemberMessageLog"
    WHERE "createdAt" >= ${from} AND "createdAt" < ${to} GROUP BY 1, 2, 3`).then((rows) => rows.map((row) => ({ day: row.day, channel: row.channel, status: row.status, count: num(row.n) })));

const smsCodeGroups = ({ from, to }: Span, now: Date) =>
  prisma.$queryRaw<Array<{ day: Date; purpose: string; outcome: "consumed" | "expired" | "open"; state: string | null; n: bigint }>>(Prisma.sql`
    SELECT date_trunc('day', "createdAt") AS day, "purpose",
      CASE WHEN "consumedAt" IS NOT NULL THEN 'consumed' WHEN "expiresAt" < ${now} THEN 'expired' ELSE 'open' END AS outcome,
      "deliveryState" AS state, count(*) AS n
    FROM "SmsCode" WHERE "createdAt" >= ${from} AND "createdAt" < ${to} GROUP BY 1, 2, 3, 4`).then((rows) => rows.map((row) => ({ day: row.day, purpose: row.purpose, outcome: row.outcome, deliveryState: row.state, count: num(row.n) })));

/** Audit rows by day for sign-in outcomes. Only the action, the method and the reason code are read: never the address (`targetId`) or an actor. */
async function signInGroups({ from, to }: Span) {
  const [failures, blocks, successes] = await Promise.all([
    prisma.$queryRaw<Array<{ day: Date; method: string | null; reason: string | null; n: bigint }>>(Prisma.sql`
      SELECT date_trunc('day', "createdAt") AS day, "metadata"->>'method' AS method, "metadata"->>'reason' AS reason, count(*) AS n FROM "AuditEvent"
      WHERE "action" = 'SIGN_IN_FAILED' AND "createdAt" >= ${from} AND "createdAt" < ${to} GROUP BY 1, 2, 3`),
    prisma.$queryRaw<Array<{ day: Date; n: bigint }>>(Prisma.sql`SELECT date_trunc('day', "createdAt") AS day, count(*) AS n FROM "AuditEvent" WHERE "action" = 'IP_BLOCKED' AND "createdAt" >= ${from} AND "createdAt" < ${to} GROUP BY 1`),
    prisma.$queryRaw<Array<{ day: Date; n: bigint }>>(Prisma.sql`SELECT date_trunc('day', "createdAt") AS day, count(*) AS n FROM "AuditEvent" WHERE "action" = 'SIGN_IN_SUCCEEDED' AND "createdAt" >= ${from} AND "createdAt" < ${to} GROUP BY 1`),
  ]);
  return {
    failures: failures.map((row) => ({ day: row.day, method: row.method ?? "unknown", reason: row.reason ?? "unknown", count: num(row.n) })),
    blocks: blocks.map((row) => ({ day: row.day, count: num(row.n) })),
    successes: successes.map((row) => ({ day: row.day, count: num(row.n) })),
  };
}

/** Stored file bytes and count per provider from the asset rows (a cheap aggregate over what is already stored). */
async function storageUse() {
  const rows = await prisma.asset.groupBy({ by: ["provider"], _sum: { byteSize: true }, _count: { _all: true } });
  const byProvider = rows.map((row) => ({ provider: row.provider, bytes: Number(row._sum.byteSize ?? 0), objects: row._count._all })).sort((a, b) => b.bytes - a.bytes);
  return { bytes: byProvider.reduce((sum, row) => sum + row.bytes, 0), objects: byProvider.reduce((sum, row) => sum + row.objects, 0), byProvider };
}

/**
 * Operations health over a window of days: outbox, email, member messages, team chat alerts, SMS codes,
 * sign-in security, job heartbeats and storage. Counts, ages and byte totals only: no address, number, message
 * text, IP, payload or error text is read into the result.
 */
export async function loadPlatformOperations(window: OpsWindow, now: Date) {
  const span = { from: window.from, to: window.to };
  const [outbox, suppression, suppressedTotal, messages, sms, signIns, chatChannels, oldest, state, beats, storage] = await Promise.all([
    outboxGroups(span),
    suppressionGroups(span),
    prisma.emailSuppression.count(),
    memberMessageGroups(span),
    smsCodeGroups(span, now),
    signInGroups(span),
    prisma.$queryRaw<Array<{ kind: string; enabled: boolean; failing: boolean; n: bigint }>>(Prisma.sql`SELECT "kind"::text AS kind, "enabled", ("failures" > 0) AS failing, count(*) AS n FROM "ChatChannel" GROUP BY 1, 2, 3`),
    prisma.outboxMessage.findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { createdAt: true, kind: true } }),
    prisma.outboxMessage.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.operationalHeartbeat.findMany({ select: { key: true, lastStartedAt: true, lastSucceededAt: true, lastSent: true, lastFailed: true, lastError: true } }),
    storageUse(),
  ]);
  const queued = (status: string) => state.find((row) => row.status === status)?._count._all ?? 0;
  return {
    days: window.days,
    outbox: {
      ...outboxRollup(outbox, window.buckets),
      now: { pending: queued("PENDING"), processing: queued("PROCESSING"), failed: queued("FAILED"), oldestPendingSeconds: ageSeconds(oldest?.createdAt ?? null, now), oldestPendingKind: oldest?.kind ?? null },
    },
    emails: emailRollup(outbox, suppression, suppressedTotal, window.buckets),
    memberMessages: memberMessageRollup(messages, window.buckets),
    chatAlerts: { ...chatAlertRollup(outbox, window.buckets), channels: chatChannelHealth(chatChannels.map((row) => ({ kind: row.kind, enabled: row.enabled, failing: row.failing, count: num(row.n) }))) },
    smsCodes: smsCodeRollup(sms, window.buckets),
    signIns: signInRollup(signIns.failures, signIns.blocks, signIns.successes, window.buckets),
    jobs: heartbeatStatuses(beats.map((row) => ({ key: row.key, lastStartedAt: row.lastStartedAt, lastSucceededAt: row.lastSucceededAt, lastSent: row.lastSent, lastFailed: row.lastFailed, hasError: Boolean(row.lastError) })), now),
    storage,
  };
}
