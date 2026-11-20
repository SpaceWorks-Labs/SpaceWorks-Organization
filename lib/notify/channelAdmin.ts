import "server-only";

import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { absoluteUrl } from "@/lib/email/message";
import { PaymentSecretsUnavailable } from "@/lib/payments/secrets";
import { parsePhone } from "@/lib/sms/phone";
import type { ConfigurableChannel } from "@/lib/messages/kinds";
import { applyDraft, changedFieldNames, configProblems } from "./config";
import { providerSpec } from "./descriptors";
import { ChannelError } from "./errors";
import { encryptChannelConfig, findChannelRow, readChannelRow } from "./store";
import { sendVia, verifyConnection } from "./transport";
import { telegramTransport } from "./transports/telegram";
import { assertMattermostHost } from "./transports/mattermost";

export type AdminResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const audit = (scopeOrgId: string | null, actorUserId: string, action: string, metadata: Record<string, string | boolean>) =>
  recordAuditEvent({ action, actorUserId, organisationId: scopeOrgId, targetType: "MessagingChannel", targetId: scopeOrgId ?? "platform", metadata });

/**
 * Save a channel's connection for the platform (scope null) or one organisation. Secrets are encrypted and write-only: a
 * blank one keeps the saved value, and none is ever returned. Audited by field name only.
 */
export async function saveChannel(input: { scopeOrgId: string | null; channel: ConfigurableChannel; provider: string; draft: Record<string, unknown>; enabled: boolean; actorUserId: string }): Promise<AdminResult> {
  const spec = providerSpec(input.channel, input.provider);
  if (!spec) return { ok: false, error: "Choose a provider." };
  const row = await findChannelRow(prisma, input.scopeOrgId, input.channel);
  const saved = row && row.provider === input.provider ? readChannelRow(row) : {};
  const { config, retype } = applyDraft(input.channel, spec, saved, input.draft);
  if (retype.length) return { ok: false, error: "Enter the secret again: it is not reused when the account changes.", fieldErrors: Object.fromEntries(retype.map((key) => [key, ["Enter this again."]])) };
  const problems = configProblems(spec, config);
  if (Object.keys(problems).length) return { ok: false, error: Object.values(problems)[0], fieldErrors: Object.fromEntries(Object.entries(problems).map(([key, message]) => [key, [message]])) };
  try {
    if (input.channel === "MATTERMOST") await assertMattermostHost(config.serverUrl);
    const data = { provider: input.provider, configEncrypted: encryptChannelConfig(config, input.scopeOrgId), enabled: input.enabled, verifiedAt: null, lastError: null };
    if (row) await prisma.messagingChannel.update({ where: { id: row.id }, data });
    else await prisma.messagingChannel.create({ data: { organisationId: input.scopeOrgId, channel: input.channel, ...data } });
  } catch (error) {
    if (error instanceof PaymentSecretsUnavailable || (error instanceof Error && error.name === "PrivateHostError")) return { ok: false, error: error.message };
    throw error;
  }
  await audit(input.scopeOrgId, input.actorUserId, "MESSAGING_CHANNEL_SAVED", { channel: input.channel, provider: input.provider, enabled: input.enabled, changed: changedFieldNames(saved, config) });
  return { ok: true };
}

export async function removeChannel(scopeOrgId: string | null, channel: ConfigurableChannel, actorUserId: string): Promise<AdminResult> {
  const { count } = await prisma.messagingChannel.deleteMany({ where: { organisationId: scopeOrgId, channel } });
  if (count) await audit(scopeOrgId, actorUserId, "MESSAGING_CHANNEL_REMOVED", { channel });
  return { ok: true };
}

/**
 * Test what is saved: the provider's own check (a bot's identity, an account fetch), and for Telegram pointing the bot at
 * our webhook. SMS is tested by texting the number typed, which is used once and never stored. The result is kept as the
 * channel's health, so the settings page says "Unavailable" when the last test failed.
 */
export async function testChannel(input: { scopeOrgId: string | null; channel: ConfigurableChannel; phone?: string; actorUserId: string }): Promise<AdminResult> {
  const row = await findChannelRow(prisma, input.scopeOrgId, input.channel);
  if (!row) return { ok: false, error: "Save the connection first." };
  const config = readChannelRow(row);
  let failure: string | null = null;
  try {
    if (input.channel === "SMS") {
      const phone = parsePhone(input.phone);
      if (!phone) return { ok: false, error: "Enter the number to text, with its country code, such as +91 98765 43210." };
      await sendVia({ channel: "SMS", provider: row.provider, config }, { identity: phone.e164, text: "Test message. Reminders will be sent this way." });
    } else {
      await verifyConnection({ channel: input.channel, provider: row.provider, config });
      if (input.channel === "TELEGRAM") await telegramTransport({ botToken: config.botToken }).setWebhook(absoluteUrl(`/api/messaging/webhooks/telegram?scope=${input.scopeOrgId ?? "platform"}`), config.webhookSecret);
    }
  } catch (error) {
    failure = error instanceof ChannelError ? error.message : "The provider did not accept the test. Check the fields and try again.";
  }
  await prisma.messagingChannel.update({ where: { id: row.id }, data: failure ? { lastError: failure.slice(0, 300) } : { verifiedAt: new Date(), lastError: null } });
  await audit(input.scopeOrgId, input.actorUserId, "MESSAGING_CHANNEL_TESTED", { channel: input.channel, ok: !failure });
  return failure ? { ok: false, error: failure } : { ok: true };
}
