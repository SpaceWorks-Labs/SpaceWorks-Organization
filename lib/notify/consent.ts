import "server-only";

import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import type { OutboxClient } from "@/lib/outbox";
import { MEMBER_CHANNELS, isMemberChannel, type MemberChannel } from "@/lib/messages/kinds";
import { safeEqual } from "./verify";

/**
 * Consent is per person, per organisation and per channel, and opt-in: a message goes to a chat or phone channel only
 * after the person turned it on. A STOP reply or the stop link in a message turns it off at once.
 */
export async function setConsent(organisationId: string, userId: string, channel: MemberChannel, status: "OPTED_IN" | "STOPPED", client: OutboxClient = prisma) {
  await client.messagingConsent.upsert({ where: { organisationId_userId_channel: { organisationId, userId, channel } }, create: { organisationId, userId, channel, status }, update: { status } });
}

export async function hasConsent(client: OutboxClient, organisationId: string, userId: string, channel: MemberChannel): Promise<boolean> {
  const row = await client.messagingConsent.findUnique({ where: { organisationId_userId_channel: { organisationId, userId, channel } }, select: { status: true } });
  return row?.status === "OPTED_IN";
}

/**
 * A STOP or UNSUBSCRIBE reply on a channel: end consent at once. A reply to an organisation's own sender stops that
 * organisation; a reply to the platform's sender stops every organisation that reaches the person through it.
 */
export async function stopFromReply(userId: string, scopeOrgId: string | null, channel: MemberChannel): Promise<number> {
  const { count } = await prisma.messagingConsent.updateMany({ where: { userId, channel, status: "OPTED_IN", ...(scopeOrgId ? { organisationId: scopeOrgId } : {}) }, data: { status: "STOPPED" } });
  return count;
}

const WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);
/** Whether an inbound text is a request to stop (the standard words, in any case, with nothing else). */
export const isStopWord = (text: string) => WORDS.has(text.trim().toLowerCase().replace(/[^a-z]/g, ""));
const START_WORDS = new Set(["start", "unstop", "yes", "subscribe"]);
export const isStartWord = (text: string) => START_WORDS.has(text.trim().toLowerCase().replace(/[^a-z]/g, ""));

// ---------- the stop link in every message ----------

function mac(payload: string) {
  const secret = process.env.AUTH_SECRET ?? "";
  if (secret.length < 32) throw new Error("AUTH_SECRET must be configured for messaging.");
  return crypto.createHmac("sha256", secret).update(`swo:messaging:stop:${payload}`).digest("base64url").slice(0, 22);
}

/** A signed token naming one person's channel in one organisation. It carries no secret and cannot be used for anything but stopping. */
export function stopToken(organisationId: string, userId: string, channel: MemberChannel) {
  const payload = `${organisationId}.${userId}.${MEMBER_CHANNELS.indexOf(channel)}`;
  return `${Buffer.from(payload).toString("base64url")}.${mac(payload)}`;
}

export function readStopToken(token: unknown): { organisationId: string; userId: string; channel: MemberChannel } | null {
  if (typeof token !== "string" || token.length > 200) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const payload = Buffer.from(body, "base64url").toString("utf8");
  if (!safeEqual(signature, mac(payload))) return null;
  const [organisationId, userId, index] = payload.split(".");
  const channel = MEMBER_CHANNELS[Number(index)];
  return organisationId && userId && channel && isMemberChannel(channel) ? { organisationId, userId, channel } : null;
}
