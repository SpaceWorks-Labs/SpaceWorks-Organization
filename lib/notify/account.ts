import "server-only";

import { prisma } from "@/lib/db";
import { verifiedEmail } from "@/lib/portal/member";
import { isSmsConfigured } from "@/lib/sms/settings";
import { CONFIGURABLE_CHANNELS, type ConfigurableChannel } from "@/lib/messages/kinds";
import { resolveChannel, type ResolvedChannel } from "./store";

/** The organisations a signed-in person is a member of, by their verified email (never by an id alone). */
export async function memberOrganisations(userId: string) {
  const email = await verifiedEmail(userId);
  if (!email) return [];
  const members = await prisma.member.findMany({ where: { email, anonymisedAt: null, organisation: { status: "ACTIVE" } }, select: { organisation: { select: { id: true, slug: true, name: true } } } });
  return members.map((member) => member.organisation);
}

export const scopeKey = (scopeOrgId: string | null) => scopeOrgId ?? "platform";
export const channelUsesPhone = (channel: ConfigurableChannel) => channel === "SMS" || channel === "WHATSAPP";

export type ChannelOffer = {
  channel: ConfigurableChannel;
  scope: string;
  scopeOrgId: string | null;
  /** Telegram: the bot's username, for the deep link. */
  bot: string | null;
  /** Phone channels need the platform's text-message provider to send the verification code. */
  canVerify: boolean;
};

const offerOf = (resolved: ResolvedChannel, canVerify: boolean): ChannelOffer => ({ channel: resolved.channel, scope: scopeKey(resolved.scopeOrgId), scopeOrgId: resolved.scopeOrgId, bot: resolved.config.botUsername?.replace(/^@/, "") ?? null, canVerify });

/** Every channel that can reach members of an organisation, with whose connection it is. Email is not listed: it needs nothing. */
export async function offersFor(organisationId: string): Promise<ChannelOffer[]> {
  const smsReady = await isSmsConfigured();
  const out: ChannelOffer[] = [];
  for (const channel of CONFIGURABLE_CHANNELS) {
    const resolved = await resolveChannel(prisma, organisationId, channel);
    if (resolved) out.push(offerOf(resolved, !channelUsesPhone(channel) || smsReady));
  }
  return out;
}
