import "server-only";

import type { MessagingChannel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decryptInstanceConfigSecret, encryptInstanceConfigSecret } from "@/lib/instanceConfigSecrets";
import { INSTANCE_SETTINGS_ID } from "@/lib/instanceSettings";
import { decryptOrgSecret, encryptOrgSecret } from "@/lib/orgSecrets";
import { smsProviderReady, type SmsConfig } from "@/lib/sms/config";
import { getSmsSettings } from "@/lib/sms/settings";
import type { OutboxClient } from "@/lib/outbox";
import { isConfigurableChannel, type ConfigurableChannel } from "@/lib/messages/kinds";
import { isReady, parseStored, type StoredConfig } from "./config";

/** A channel as the sender uses it: whose it is, which provider, and its fields (decrypted). */
export type ResolvedChannel = {
  channel: ConfigurableChannel;
  scope: "org" | "platform";
  /** The organisation that owns the connection; null for the platform's. Personal endpoints are stored under this id. */
  scopeOrgId: string | null;
  provider: string;
  config: StoredConfig;
  /** Platform SMS only: the provider's own field names, as the SMS code path uses them. */
  smsConfig?: SmsConfig;
};

export const encryptChannelConfig = (config: StoredConfig, organisationId: string | null) =>
  organisationId ? encryptOrgSecret(JSON.stringify(config), organisationId, "messaging") : encryptInstanceConfigSecret(JSON.stringify(config));

export function readChannelRow(row: Pick<MessagingChannel, "configEncrypted" | "organisationId">): StoredConfig {
  return parseStored(row.organisationId ? decryptOrgSecret(row.configEncrypted, row.organisationId, "messaging") : decryptInstanceConfigSecret(row.configEncrypted));
}

/** The saved row for a scope (organisationId null: the platform's) and channel. */
export const findChannelRow = (client: OutboxClient, organisationId: string | null, channel: ConfigurableChannel) =>
  client.messagingChannel.findFirst({ where: { organisationId, channel } });

export async function platformMayBeUsed(client: OutboxClient = prisma): Promise<boolean> {
  const row = await client.instanceSetting.findUnique({ where: { id: INSTANCE_SETTINGS_ID }, select: { messagingOrgsMayUsePlatform: true } });
  return row?.messagingOrgsMayUsePlatform ?? true;
}

/** A row that can send now: on, complete, and not failing its last test. */
const usable = (row: MessagingChannel | null): row is MessagingChannel => Boolean(row?.enabled && !row.lastError && isReady(row.channel as ConfigurableChannel, row.provider, readChannelRow(row)));

/** The platform's SMS provider in the shape channels use, or null when none is set up. */
async function platformSms(): Promise<ResolvedChannel | null> {
  const { provider, config, lastError } = await getSmsSettings();
  if (!provider || lastError || !smsProviderReady(provider, config)) return null;
  return { channel: "SMS", scope: "platform", scopeOrgId: null, provider, config: {}, smsConfig: config };
}

async function platformChannel(client: OutboxClient, channel: ConfigurableChannel): Promise<ResolvedChannel | null> {
  if (channel === "SMS") return platformSms();
  const row = await findChannelRow(client, null, channel);
  return usable(row) ? { channel, scope: "platform", scopeOrgId: null, provider: row.provider, config: readChannelRow(row) } : null;
}

/** The organisation's own connection, else the platform's when organisations may use it, else null. */
export async function resolveChannel(client: OutboxClient, organisationId: string, channel: ConfigurableChannel): Promise<ResolvedChannel | null> {
  const own = await findChannelRow(client, organisationId, channel);
  if (usable(own)) return { channel, scope: "org", scopeOrgId: organisationId, provider: own.provider, config: readChannelRow(own) };
  return (await platformMayBeUsed(client)) ? platformChannel(client, channel) : null;
}

/** The connection a personal endpoint under this scope belongs to (used by webhooks, which arrive per scope). */
export async function channelForScope(scopeOrgId: string | null, channel: unknown): Promise<ResolvedChannel | null> {
  if (!isConfigurableChannel(channel)) return null;
  if (scopeOrgId === null) return platformChannel(prisma, channel);
  const own = await findChannelRow(prisma, scopeOrgId, channel);
  return usable(own) ? { channel, scope: "org", scopeOrgId, provider: own.provider, config: readChannelRow(own) } : null;
}

export type ChannelStatus = { state: "unset" | "off" | "incomplete" | "failed" | "untested" | "working"; detail: string | null };

/** An honest word for the settings screen: never "connected" for something that has not been tested. */
export function channelStatus(row: MessagingChannel | null): ChannelStatus {
  if (!row) return { state: "unset", detail: null };
  if (!isReady(row.channel as ConfigurableChannel, row.provider, readChannelRow(row))) return { state: "incomplete", detail: null };
  if (!row.enabled) return { state: "off", detail: null };
  if (row.lastError) return { state: "failed", detail: row.lastError };
  return row.verifiedAt ? { state: "working", detail: null } : { state: "untested", detail: null };
}
