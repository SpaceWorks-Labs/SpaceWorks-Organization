import "server-only";

import { prisma } from "@/lib/db";
import { absoluteUrl } from "@/lib/email/message";
import { CONFIGURABLE_CHANNELS, type ConfigurableChannel } from "@/lib/messages/kinds";
import { describeConfig } from "./config";
import { CHANNEL_SPECS } from "./descriptors";
import { channelStatus, readChannelRow, type ChannelStatus } from "./store";

export type ChannelView = {
  channel: ConfigurableChannel;
  provider: string;
  enabled: boolean;
  saved: boolean;
  status: ChannelStatus;
  values: Record<string, string>;
  secretsSaved: string[];
  /** The addresses the provider needs to be given, for this connection. */
  webhooks: Array<{ label: string; url: string }>;
};

function webhooksFor(channel: ConfigurableChannel, provider: string, scope: string) {
  const url = (path: string) => absoluteUrl(`/api/messaging/webhooks/${path}?scope=${scope}`);
  switch (channel) {
    case "TELEGRAM": return [{ label: "Set automatically when you test", url: url("telegram") }];
    case "SLACK": return [{ label: "Event subscriptions request URL (subscribe to message.im)", url: url("slack") }];
    case "DISCORD": return [{ label: "Interactions endpoint URL (add /link with a code option, and /stop)", url: url("discord") }];
    case "MATTERMOST": return [{ label: "Slash command request URL for /link (POST)", url: url("mattermost") }];
    case "WHATSAPP": return provider === "meta" ? [{ label: "Webhook callback URL (verify token above)", url: url("whatsapp-meta") }] : [{ label: "Inbound and status callback URL", url: url("twilio") }];
    case "SMS": return provider === "twilio" ? [{ label: "Inbound message URL, for STOP replies", url: url("twilio") }] : [];
  }
}

/** Every channel for one scope (the platform's, or one organisation's) as the settings page may show it: never a secret. */
export async function channelViews(organisationId: string | null, skip: ConfigurableChannel[] = []): Promise<ChannelView[]> {
  const rows = await prisma.messagingChannel.findMany({ where: { organisationId } });
  const scope = organisationId ?? "platform";
  return CONFIGURABLE_CHANNELS.filter((channel) => !skip.includes(channel)).map((channel) => {
    const row = rows.find((item) => item.channel === channel) ?? null;
    const provider = row?.provider ?? CHANNEL_SPECS[channel].providers[0].id;
    const described = describeConfig(channel, provider, row ? readChannelRow(row) : {});
    return { channel, provider, enabled: row?.enabled ?? true, saved: Boolean(row), status: channelStatus(row), values: described.values, secretsSaved: described.secretsSaved, webhooks: webhooksFor(channel, provider, scope) };
  });
}

export async function whatsappTemplateRows(organisationId: string | null) {
  const rows = await prisma.whatsAppTemplate.findMany({ where: { organisationId }, orderBy: [{ kind: "asc" }, { language: "asc" }], select: { kind: true, language: true, name: true, variables: true } });
  return rows;
}
