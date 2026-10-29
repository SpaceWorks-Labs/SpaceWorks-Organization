import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Write a deliberately minimal audit record. Callers must not pass PII,
 * passwords, reset links, tokens, or join-form answers in metadata.
 */
export async function recordAuditEvent(params: {
  action: string;
  actorUserId?: string | null;
  organisationId?: string | null;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, string | number | boolean | null>;
  client?: Prisma.TransactionClient;
}) {
  const client = params.client ?? prisma;
  return client.auditEvent.create({
    data: {
      action: params.action,
      actorUserId: params.actorUserId ?? null,
      organisationId: params.organisationId ?? null,
      targetType: params.targetType ?? null,
      targetId: params.targetId ?? null,
      metadata: params.metadata ?? undefined,
    },
  });
}

/**
 * For autosaving editors: record the event unless the same actor already has
 * one for the same action and target within `windowMs`.
 */
export async function recordThrottledAuditEvent(params: Parameters<typeof recordAuditEvent>[0] & { windowMs: number }) {
  const { windowMs, ...event } = params;
  const recent = await (event.client ?? prisma).auditEvent.findFirst({
    where: {
      action: event.action,
      actorUserId: event.actorUserId ?? null,
      targetType: event.targetType ?? null,
      targetId: event.targetId ?? null,
      createdAt: { gt: new Date(Date.now() - windowMs) },
    },
    select: { id: true },
  });
  if (recent) return null;
  return recordAuditEvent(event);
}
