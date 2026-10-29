"use server";

import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { orgActionAccess } from "@/lib/permissions";
import { encryptOrgSecret } from "@/lib/orgSecrets";
import { assertPublicHost, PrivateHostError } from "@/lib/net/publicHost";
import { PaymentSecretsUnavailable } from "@/lib/payments/secrets";
import { CHAT_CONFIG_SCHEMAS, describeTarget, type ChatConfig } from "@/lib/chat/config";
import { CHAT_EVENTS, CHAT_KINDS, type ChatKind } from "@/lib/chat/events";
import { readChannelConfig } from "@/lib/chat/notify";
import { ChatGoneError, ChatSendError, sendChatMessage } from "@/lib/chat/send";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const MAX_CHANNELS = 10;
const slug = z.string().trim().min(1).max(64);
const id = z.string().trim().min(1).max(64);

const channelSchema = z.object({
  organisationSlug: slug,
  channelId: id.optional(),
  kind: z.enum(CHAT_KINDS),
  name: z.string().trim().min(1, "Give the channel a name").max(80),
  events: z.array(z.enum(CHAT_EVENTS)).min(1, "Pick at least one alert").max(CHAT_EVENTS.length),
  includeNames: z.boolean(),
  enabled: z.boolean(),
  /** Required when adding; leave out when editing to keep the saved destination. */
  config: z.record(z.string(), z.unknown()).optional(),
});

async function access(organisationSlug: unknown) {
  const ctx = await orgActionAccess(organisationSlug, "org.settings");
  if (!ctx.ok) return ctx;
  if (await isActionRateLimited("action", ctx.userId)) return { ok: false as const, error: "Too many requests. Try again shortly." };
  return ctx;
}

const refresh = (orgSlug: string) => revalidatePath(`/dashboard/${orgSlug}/settings/notifications`);

/** Add or edit a chat channel. The destination is checked against its provider and stored encrypted. */
export async function saveChatChannel(input: unknown): Promise<ActionResult<{ channelId: string }>> {
  const parsed = channelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const { channelId, kind, name, events, includeNames, enabled, config } = parsed.data;
  const existing = channelId ? await prisma.chatChannel.findFirst({ where: { id: channelId, organisationId: ctx.organisation.id } }) : null;
  if (channelId && !existing) return { ok: false, error: "Channel not found." };
  if (existing && existing.kind !== kind) return { ok: false, error: "A channel can't change its kind. Add a new one instead." };
  if (!existing && (await prisma.chatChannel.count({ where: { organisationId: ctx.organisation.id } })) >= MAX_CHANNELS) return { ok: false, error: `An organisation can have up to ${MAX_CHANNELS} channels.` };
  if (!existing && !config) return { ok: false, error: "Add the channel's connection details." };

  let secret: { configEncrypted: string; target: string } | null = null;
  if (config) {
    const checked = CHAT_CONFIG_SCHEMAS[kind as ChatKind].safeParse(config);
    if (!checked.success) return { ok: false, error: checked.error.issues[0]?.message ?? "Check the connection details." };
    try {
      if (kind === "MATTERMOST") await assertPublicHost(new URL((checked.data as ChatConfig["MATTERMOST"]).webhookUrl).hostname);
      secret = { configEncrypted: encryptOrgSecret(JSON.stringify(checked.data), ctx.organisation.id, "chat"), target: describeTarget(kind, checked.data as ChatConfig[ChatKind]) };
    } catch (error) {
      if (error instanceof PrivateHostError || error instanceof PaymentSecretsUnavailable) return { ok: false, error: error.message };
      throw error;
    }
  }
  const data = { name, events, includeNames, enabled, ...(secret ? { ...secret, lastError: null, failures: 0 } : {}) };
  const channel = existing
    ? await prisma.chatChannel.update({ where: { id: existing.id }, data })
    : await prisma.chatChannel.create({ data: { organisationId: ctx.organisation.id, kind, ...data, configEncrypted: secret!.configEncrypted } });
  await recordAuditEvent({ action: existing ? "CHAT_CHANNEL_UPDATED" : "CHAT_CHANNEL_ADDED", actorUserId: ctx.userId, organisationId: ctx.organisation.id, targetType: "ChatChannel", targetId: channel.id, metadata: { kind, events: events.join(","), includeNames, destinationChanged: Boolean(secret) } });
  refresh(ctx.organisation.slug);
  return { ok: true, data: { channelId: channel.id } };
}

const channelRef = z.object({ organisationSlug: slug, channelId: id });

export async function deleteChatChannel(input: unknown): Promise<ActionResult> {
  const parsed = channelRef.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const removed = await prisma.chatChannel.deleteMany({ where: { id: parsed.data.channelId, organisationId: ctx.organisation.id } });
  if (removed.count === 0) return { ok: false, error: "Channel not found." };
  await recordAuditEvent({ action: "CHAT_CHANNEL_REMOVED", actorUserId: ctx.userId, organisationId: ctx.organisation.id, targetType: "ChatChannel", targetId: parsed.data.channelId });
  refresh(ctx.organisation.slug);
  return { ok: true };
}

/** Post a test message straight away (not through the queue) and record how it went. */
export async function testChatChannel(input: unknown): Promise<ActionResult> {
  const parsed = channelRef.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const channel = await prisma.chatChannel.findFirst({ where: { id: parsed.data.channelId, organisationId: ctx.organisation.id } });
  if (!channel) return { ok: false, error: "Channel not found." };
  try {
    await sendChatMessage(channel.kind, readChannelConfig(channel), `${ctx.organisation.name}: test alert from Space Works Organization. Alerts you picked will arrive here.`);
  } catch (error) {
    const message = error instanceof ChatGoneError || error instanceof ChatSendError || error instanceof PrivateHostError ? error.message : "The test couldn't be sent.";
    await prisma.chatChannel.update({ where: { id: channel.id }, data: { lastError: message.slice(0, 300) } });
    refresh(ctx.organisation.slug);
    return { ok: false, error: message };
  }
  await prisma.chatChannel.update({ where: { id: channel.id }, data: { lastDeliveredAt: new Date(), lastError: null, failures: 0 } });
  refresh(ctx.organisation.slug);
  return { ok: true };
}
