"use server";

import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { requireAuth } from "@/lib/permissions";
import { CONFIGURABLE_CHANNELS, type ConfigurableChannel } from "@/lib/messages/kinds";
import { channelUsesPhone, memberOrganisations, offersFor } from "@/lib/notify/account";
import { setConsent } from "@/lib/notify/consent";
import { linkEndpoint, liveIdentity, revokeEndpoint, startChallenge } from "@/lib/notify/endpoints";
import { checkSmsCode, requestSmsCode } from "@/lib/sms/codes";
import { parsePhone } from "@/lib/sms/phone";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const base = z.object({ channel: z.enum(CONFIGURABLE_CHANNELS), scope: z.string().trim().min(1).max(40) });

/** The offer this person may use: the scope is one of their organisations' connections for that channel. Never trust the scope typed. */
async function offerFor(userId: string, channel: ConfigurableChannel, scope: string) {
  for (const org of await memberOrganisations(userId)) {
    const offer = (await offersFor(org.id)).find((item) => item.channel === channel && item.scope === scope);
    if (offer) return offer;
  }
  return null;
}

const toScopeOrg = (scope: string) => (scope === "platform" ? null : scope);
const refresh = () => revalidatePath("/account/notifications");
const MESSAGES = { gone: "That channel is not available any more.", limited: "Too many requests. Try again shortly." };

export type LinkStart = { code: string; link: string | null; expiresAt: string };

/** Telegram, Slack, Discord and Mattermost: a one-time code the person sends to the bot (Telegram: opens as a link). */
export async function startChatLink(input: unknown): Promise<ActionResult<LinkStart>> {
  const parsed = base.safeParse(input);
  if (!parsed.success || channelUsesPhone(parsed.data.channel)) return { ok: false, error: "Invalid request." };
  const session = await requireAuth();
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: MESSAGES.limited };
  const offer = await offerFor(session.user.id, parsed.data.channel, parsed.data.scope);
  if (!offer) return { ok: false, error: MESSAGES.gone };
  const started = await startChallenge({ userId: session.user.id, scopeOrgId: toScopeOrg(parsed.data.scope), channel: parsed.data.channel });
  if (!started.ok) return { ok: false, error: started.error };
  const link = offer.channel === "TELEGRAM" && offer.bot ? `https://t.me/${offer.bot}?start=${started.code.replace("-", "_")}` : null;
  return { ok: true, data: { code: started.code, link, expiresAt: started.expiresAt.toISOString() } };
}

/** SMS and WhatsApp: text a code to the number (the platform's text-message provider, with its per-number and per-country limits). */
export async function startPhoneLink(input: unknown): Promise<ActionResult> {
  const parsed = base.extend({ phone: z.string().trim().max(40) }).safeParse(input);
  if (!parsed.success || !channelUsesPhone(parsed.data.channel)) return { ok: false, error: "Invalid request." };
  const session = await requireAuth();
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: MESSAGES.limited };
  const offer = await offerFor(session.user.id, parsed.data.channel, parsed.data.scope);
  if (!offer?.canVerify) return { ok: false, error: "Numbers can't be verified here yet." };
  const phone = parsePhone(parsed.data.phone);
  if (!phone) return { ok: false, error: "Enter the number with its country code, such as +91 98765 43210." };
  const result = await requestSmsCode({ purpose: "VERIFY", phone, userId: session.user.id });
  return result.ok ? { ok: true } : { ok: false, error: "Too many codes have been asked for this number or country. Try again later." };
}

export async function confirmPhoneLink(input: unknown): Promise<ActionResult> {
  const parsed = base.extend({ phone: z.string().trim().max(40), code: z.string().trim().max(10) }).safeParse(input);
  if (!parsed.success || !channelUsesPhone(parsed.data.channel)) return { ok: false, error: "Invalid request." };
  const session = await requireAuth();
  const offer = await offerFor(session.user.id, parsed.data.channel, parsed.data.scope);
  const phone = parsePhone(parsed.data.phone);
  if (!offer || !phone) return { ok: false, error: "Check the number and try again." };
  if (!(await checkSmsCode({ purpose: "VERIFY", phone, code: parsed.data.code, consume: true, userId: session.user.id })).ok) return { ok: false, error: "That code didn't match or has expired. Ask for a new one." };
  const linked = await linkEndpoint({ userId: session.user.id, scopeOrgId: toScopeOrg(parsed.data.scope), channel: parsed.data.channel, identity: phone.e164 });
  if (!linked) return { ok: false, error: "This number can't be added to your account." };
  await recordAuditEvent({ action: "MESSAGING_ENDPOINT_LINKED", actorUserId: session.user.id, targetType: "NotificationEndpoint", targetId: parsed.data.channel, metadata: { channel: parsed.data.channel } });
  refresh();
  return { ok: true };
}

/** Unlink a channel. Consent stays recorded but nothing can be sent without an address. */
export async function removeEndpoint(input: unknown): Promise<ActionResult> {
  const parsed = base.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const session = await requireAuth();
  if (await revokeEndpoint(session.user.id, toScopeOrg(parsed.data.scope), parsed.data.channel)) {
    await recordAuditEvent({ action: "MESSAGING_ENDPOINT_REMOVED", actorUserId: session.user.id, targetType: "NotificationEndpoint", targetId: parsed.data.channel, metadata: { channel: parsed.data.channel } });
  }
  refresh();
  return { ok: true };
}

/** Opt in or out of one channel for one organisation. Opting in needs a linked address first. */
export async function setChannelConsent(input: unknown): Promise<ActionResult> {
  const parsed = base.extend({ organisationSlug: z.string().trim().min(1).max(64), on: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const session = await requireAuth();
  const org = (await memberOrganisations(session.user.id)).find((item) => item.slug === parsed.data.organisationSlug);
  if (!org) return { ok: false, error: "Organisation not found." };
  if (parsed.data.on) {
    const offer = (await offersFor(org.id)).find((item) => item.channel === parsed.data.channel);
    if (!offer || !(await liveIdentity(session.user.id, offer.scopeOrgId, parsed.data.channel))) return { ok: false, error: "Link this channel first." };
  }
  await setConsent(org.id, session.user.id, parsed.data.channel, parsed.data.on ? "OPTED_IN" : "STOPPED");
  await recordAuditEvent({ action: parsed.data.on ? "MESSAGING_CONSENT_GIVEN" : "MESSAGING_CONSENT_WITHDRAWN", actorUserId: session.user.id, organisationId: org.id, targetType: "Organisation", targetId: org.id, metadata: { channel: parsed.data.channel } });
  refresh();
  return { ok: true };
}
