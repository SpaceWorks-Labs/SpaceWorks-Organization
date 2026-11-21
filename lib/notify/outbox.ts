import "server-only";

import type { Prisma } from "@prisma/client";
import { isMemberMessageKind } from "@/lib/messages/kinds";
import { PermanentOutboxError, type OutboxKindHandler } from "@/lib/outboxKinds";
import { deliverMemberMessage, type MemberMessage } from "./deliver";
import { cleanValues } from "./send";

/** `certificate-email` is a member message too (the certificate PDF); it lives with the certificate email code. */
export { certificateEmail } from "@/lib/email/certificate";

const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 64;

/** The queued row, checked again at delivery: ids, a known kind, and bounded plain values. */
export function asMemberMessagePayload(value: Prisma.JsonValue): MemberMessage | null {
  const p = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  if (!p || !isId(p.organisationId) || !isId(p.memberId) || !isMemberMessageKind(p.kind) || typeof p.dedupeKey !== "string" || !p.dedupeKey || p.dedupeKey.length > 200) return null;
  const values = p.values && typeof p.values === "object" && !Array.isArray(p.values) ? (p.values as Record<string, string | null>) : {};
  return { organisationId: p.organisationId, memberId: p.memberId, kind: p.kind, dedupeKey: p.dedupeKey, values: cleanValues(values) };
}

/** `member-message`: one message to one member through the organisation's routing. The values can carry a pay link, so the row goes once it is sent. */
export const memberMessage: OutboxKindHandler = {
  capability: true,
  async deliver(value, messageId) {
    const payload = asMemberMessagePayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverMemberMessage(payload, messageId);
  },
};
