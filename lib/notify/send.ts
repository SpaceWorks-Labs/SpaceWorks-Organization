import "server-only";

import type { Prisma } from "@prisma/client";
import { queueChatAlerts } from "@/lib/chat/notify";
import { isConfigurableChannel, routeFor, type MemberChannel, type MemberMessageKind } from "@/lib/messages/kinds";
import { hasConsent } from "./consent";
import { liveIdentity } from "./endpoints";
import { inQuietHours, quietEnd } from "./quiet";
import { loadOrgMessaging, loadWhatsAppTemplate, messageLanguages } from "./settings";
import { resolveChannel } from "./store";

export type { MemberMessageKind };

const MAX_VALUES = 24;
const MAX_VALUE_LENGTH = 2000;

/** Values are bounded and plain: the outbox row is validated again when it is delivered. */
export function cleanValues(values: Record<string, string | null>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(values).slice(0, MAX_VALUES)) {
    if (/^[A-Za-z]{1,30}$/.test(key)) out[key] = typeof value === "string" ? value.slice(0, MAX_VALUE_LENGTH) : null;
  }
  return out;
}

type Reach = { userId: string | null; organisationId: string; locale: string | null };

/** Whether a channel could carry this message to this member right now: connected, consented, linked, and a template where WhatsApp needs one. */
async function reachable(tx: Prisma.TransactionClient, member: Reach, kind: MemberMessageKind, channel: MemberChannel): Promise<boolean> {
  if (channel === "EMAIL") return true;
  if (!isConfigurableChannel(channel) || !member.userId) return false;
  const resolved = await resolveChannel(tx, member.organisationId, channel);
  if (!resolved || !(await hasConsent(tx, member.organisationId, member.userId, channel))) return false;
  if (!(await liveIdentity(member.userId, resolved.scopeOrgId, channel))) return false;
  return channel !== "WHATSAPP" || Boolean(await loadWhatsAppTemplate(tx, resolved.scopeOrgId, kind, messageLanguages(member.locale)));
}

/**
 * Queue one message to a member, in the caller's transaction, once per `dedupeKey`: the log row's unique key makes a
 * second call a no-op. The organisation's routing for this kind (an ordered list, with fallback) is read now to decide
 * whether anything can be sent and when (texts and chat messages wait out quiet hours); the row is delivered later by
 * `deliverMemberMessage`, which checks consent and the linked address again and sends through exactly one channel.
 * A message nobody can receive is logged as failed and queues nothing. Nothing is queued for erased members or
 * organisations that are not active.
 */
export async function queueMemberMessage(
  tx: Prisma.TransactionClient,
  input: { organisationId: string; memberId: string; kind: MemberMessageKind; values: Record<string, string | null>; dedupeKey: string },
): Promise<void> {
  const member = await tx.member.findFirst({
    where: { id: input.memberId, organisationId: input.organisationId },
    select: { userId: true, anonymisedAt: true, organisation: { select: { status: true, timezone: true, locale: true } } },
  });
  if (!member || member.anonymisedAt || member.organisation.status !== "ACTIVE") return;
  const created = await tx.memberMessageLog.createMany({ data: [{ organisationId: input.organisationId, memberId: input.memberId, kind: input.kind, dedupeKey: input.dedupeKey }], skipDuplicates: true });
  if (created.count === 0) return;
  const values = cleanValues(input.values);
  // A member who says they paid also puts the payment in front of the team, through the organisation's chat alerts.
  if (input.kind === "payment-claim-pending" && values.paymentId) await queueChatAlerts(tx, input.organisationId, "payment-to-confirm", { paymentId: values.paymentId });
  const settings = await loadOrgMessaging(tx, input.organisationId);
  const reach: Reach = { userId: member.userId, organisationId: input.organisationId, locale: member.organisation.locale };
  let first: MemberChannel | null = null;
  for (const channel of routeFor(settings.routing, input.kind)) {
    if (await reachable(tx, reach, input.kind, channel)) { first = channel; break; }
  }
  if (!first) {
    await tx.memberMessageLog.updateMany({ where: { organisationId: input.organisationId, memberId: input.memberId, dedupeKey: input.dedupeKey }, data: { status: "FAILED" } });
    return;
  }
  const { timezone } = member.organisation;
  const now = new Date();
  const wait = first !== "EMAIL" && inQuietHours(now, timezone, settings.quietStart, settings.quietEnd) ? quietEnd(now, timezone, settings.quietStart, settings.quietEnd) : null;
  await tx.outboxMessage.create({
    data: { kind: "member-message", payload: { organisationId: input.organisationId, memberId: input.memberId, kind: input.kind, values, dedupeKey: input.dedupeKey } as Prisma.InputJsonValue, ...(wait ? { availableAt: wait } : {}) },
  });
}
