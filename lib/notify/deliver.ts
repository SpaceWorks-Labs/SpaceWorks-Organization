import "server-only";

import { prisma } from "@/lib/db";
import { absoluteUrl, sendBrandedEmail } from "@/lib/email/message";
import { EmailSuppressedError } from "@/lib/email/suppression";
import { EmailRecipientRejectedError } from "@/lib/email/transporter";
import { renderEmailTemplate, renderShortText, type PlaceholderValues } from "@/lib/email/templates";
import { STANDARD_ACTIONS, STANDARD_MESSAGES } from "@/lib/messages/standard";
import { isConfigurableChannel, routeFor, type MemberChannel, type MemberMessageKind } from "@/lib/messages/kinds";
import { PermanentOutboxError } from "@/lib/outboxKinds";
import { hasConsent, stopToken } from "./consent";
import { liveIdentity } from "./endpoints";
import { ChannelError } from "./errors";
import { inQuietHours } from "./quiet";
import { loadOrgMessaging, loadOrgTemplate, loadWhatsAppTemplate, messageLanguages } from "./settings";
import { resolveChannel } from "./store";
import { sendVia } from "./transport";

/** What a member message is: ids and the values that fill its wording. One delivery per `dedupeKey`. */
export type MemberMessage = { organisationId: string; memberId: string; kind: MemberMessageKind; values: Record<string, string | null>; dedupeKey: string };

/** An email's finished parts, when the caller already built them (a receipt or card PDF, a refund note). */
export type EmailParts = { subject: string; heading: string; paragraphs: string[]; action?: { label: string; url: string }; footnote?: string; attachments?: Array<{ filename: string; content: Buffer; contentType: string }> };

export const stopUrl = (organisationId: string, userId: string, channel: MemberChannel) => absoluteUrl(`/api/messaging/stop/${stopToken(organisationId, userId, channel)}`);

const permanentEmail = (error: unknown) => error instanceof EmailSuppressedError || error instanceof EmailRecipientRejectedError;
/** The outbox id becomes an idempotency token for providers that take one. */
const keyOf = (messageId: string) => /^<?(swo-[A-Za-z0-9_-]{1,64})@/.exec(messageId)?.[1];

type Context = {
  message: MemberMessage;
  messageId: string;
  member: { userId: string | null; email: string; name: string };
  org: { name: string; slug: string; timezone: string; locale: string | null; memberPortal: boolean };
  extras?: { email?: EmailParts };
  quiet: boolean;
  logId: string;
};

type Attempt = { sent: false } | { sent: true; providerRef?: string };

async function viaEmail(ctx: Context): Promise<Attempt> {
  const { message, org } = ctx;
  if (!ctx.member.email) return { sent: false };
  const own = await loadOrgTemplate(prisma, message.organisationId, message.kind);
  const standard = STANDARD_MESSAGES[message.kind];
  const values = message.values as PlaceholderValues;
  const built = ctx.extras?.email ?? {
    ...renderEmailTemplate(own ?? standard, values),
    action: message.values.payLink
      ? { label: STANDARD_ACTIONS[message.kind] ?? "Pay now", url: message.values.payLink }
      : org.memberPortal ? { label: "See your membership", url: absoluteUrl("/account") } : { label: `Visit ${org.name}`, url: absoluteUrl(`/o/${org.slug}`) },
  };
  // Email is how people already hear from the organisation: say where to choose, not how to opt out of notices they need.
  const manage = org.memberPortal && ctx.member.userId ? `Choose how ${org.name} contacts you: ${absoluteUrl("/account/notifications")}` : undefined;
  await sendBrandedEmail({ organisationId: message.organisationId, to: ctx.member.email, messageId: ctx.messageId, ...built, footnote: [built.footnote, manage].filter(Boolean).join("\n") || undefined });
  return { sent: true };
}

async function viaChannel(ctx: Context, channel: MemberChannel): Promise<Attempt> {
  const { message, member } = ctx;
  if (!isConfigurableChannel(channel) || !member.userId) return { sent: false };
  const resolved = await resolveChannel(prisma, message.organisationId, channel);
  if (!resolved) return { sent: false };
  // Opt-in, a verified address in this connection's scope, and not inside quiet hours.
  if (!(await hasConsent(prisma, message.organisationId, member.userId, channel))) return { sent: false };
  const identity = await liveIdentity(member.userId, resolved.scopeOrgId, channel);
  if (!identity || ctx.quiet) return { sent: false };
  const stop = stopUrl(message.organisationId, member.userId, channel);
  const values = { ...message.values, stopLink: stop } as Record<string, string | null>;
  const key = keyOf(ctx.messageId);
  if (channel === "WHATSAPP") {
    const template = await loadWhatsAppTemplate(prisma, resolved.scopeOrgId, message.kind, messageLanguages(ctx.org.locale));
    if (!template) return { sent: false };
    const variables = template.variables.map((name) => (values[name] ?? "").trim() || "-");
    return { sent: true, ...(await sendVia(resolved, { identity, text: "", key: key && `${key}-wa`, template: { name: template.name, language: template.language, variables } })) };
  }
  const own = await loadOrgTemplate(prisma, message.organisationId, message.kind);
  const text = `${renderShortText(own?.shortText?.trim() || STANDARD_MESSAGES[message.kind].short, values as PlaceholderValues)}\nStop these messages: ${stop}`;
  return { sent: true, ...(await sendVia(resolved, { identity, text, key: key && `${key}-${channel.toLowerCase()}` })) };
}

/**
 * Deliver one member message: through the first channel on the organisation's route (per kind, with fallback) that the
 * member can be reached on, and no other. A channel that cannot be used for this member (no linked address, no
 * consent, quiet hours, no template) is skipped; one that refuses for good is remembered, so a retry never goes back
 * to it; an outage throws so the queue tries the same channel again. The log row makes it once per dedupe key.
 */
export async function deliverMemberMessage(message: MemberMessage, messageId: string, extras?: { email?: EmailParts }): Promise<"sent" | "dropped"> {
  const member = await prisma.member.findFirst({
    where: { id: message.memberId, organisationId: message.organisationId },
    select: { userId: true, email: true, name: true, anonymisedAt: true, organisation: { select: { name: true, slug: true, status: true, timezone: true, locale: true, memberPortal: true } } },
  });
  if (!member || member.anonymisedAt || member.organisation.status !== "ACTIVE") return "dropped";
  const log = await prisma.memberMessageLog.upsert({
    where: { organisationId_memberId_dedupeKey: { organisationId: message.organisationId, memberId: message.memberId, dedupeKey: message.dedupeKey } },
    create: { organisationId: message.organisationId, memberId: message.memberId, kind: message.kind, dedupeKey: message.dedupeKey },
    update: {},
  });
  if (log.status === "SENT") return "sent";
  if (log.status === "FAILED") return "dropped";
  const settings = await loadOrgMessaging(prisma, message.organisationId);
  const ctx: Context = { message, messageId, member, org: member.organisation, extras, quiet: inQuietHours(new Date(), member.organisation.timezone, settings.quietStart, settings.quietEnd), logId: log.id };
  const route = routeFor(settings.routing, message.kind).filter((channel) => !log.refused.includes(channel));
  const refused: string[] = [];
  for (const [index, channel] of route.entries()) {
    try {
      const result = channel === "EMAIL" ? await viaEmail(ctx) : await viaChannel(ctx, channel);
      if (!result.sent) continue;
      await prisma.memberMessageLog.update({ where: { id: log.id }, data: { status: "SENT", channel, providerRef: result.providerRef ?? null, deliveryState: "sent" } });
      return "sent";
    } catch (error) {
      const refusal = error instanceof ChannelError ? !error.retryable : permanentEmail(error);
      if (!refusal) throw error;
      refused.push(channel);
      await prisma.memberMessageLog.update({ where: { id: log.id }, data: { refused: { push: channel } } });
      // The last channel's refusal keeps its own meaning for the outbox (a suppressed address fails the row at once).
      if (index === route.length - 1 && permanentEmail(error)) throw error;
    }
  }
  await prisma.memberMessageLog.update({ where: { id: log.id }, data: { status: "FAILED" } });
  if (refused.length) throw new PermanentOutboxError();
  return "dropped";
}

/** Delivery states reported later by a provider's webhook land on the log row by the provider's message id. */
export async function recordDeliveryState(providerRef: string, state: string) {
  if (!providerRef || providerRef.length > 120) return;
  await prisma.memberMessageLog.updateMany({ where: { providerRef }, data: { deliveryState: state.slice(0, 20) } });
}
