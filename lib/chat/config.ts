import { z } from "zod";
import type { ChatKind } from "./events";

/**
 * What each kind of channel needs. Every destination is pinned to its provider's own address, except
 * Mattermost, which is self-hosted: its host must be public HTTPS (checked when saving and when sending).
 */
const slack = z.object({ webhookUrl: z.string().trim().regex(/^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_/-]{10,200}$/, "Paste a Slack incoming webhook URL (https://hooks.slack.com/services/…)") });
const discord = z.object({ webhookUrl: z.string().trim().regex(/^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,30}\/[A-Za-z0-9_-]{20,120}$/, "Paste a Discord webhook URL (https://discord.com/api/webhooks/…)") });
const mattermost = z.object({ webhookUrl: z.string().trim().regex(/^https:\/\/[a-z0-9.-]+(?::\d{2,5})?\/hooks\/[a-z0-9]{10,64}$/i, "Paste a Mattermost incoming webhook URL (https://your-server/hooks/…)") });
const telegram = z.object({
  botToken: z.string().trim().regex(/^\d{5,15}:[A-Za-z0-9_-]{30,64}$/, "Paste the bot token from @BotFather"),
  chatId: z.string().trim().regex(/^(-?\d{3,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/, "Use the chat's numeric ID or @channelname"),
});
const whatsapp = z.object({
  phoneNumberId: z.string().trim().regex(/^\d{5,20}$/, "Use the phone number ID from WhatsApp Manager"),
  accessToken: z.string().trim().min(20, "Paste a permanent access token").max(1000),
  recipients: z.array(z.string().trim().regex(/^\+?[1-9]\d{7,14}$/, "Use full numbers with the country code")).min(1, "Add at least one number").max(5, "At most five numbers"),
  templateName: z.string().trim().regex(/^[a-z0-9_]{1,100}$/).default("team_alert"),
  language: z.string().trim().regex(/^[a-z]{2}(_[A-Z]{2})?$/).default("en"),
});

/** Any HTTPS address on a public host (checked when saving and when sending). Each post is signed with the secret. */
const webhook = z.object({
  url: z.string().trim().max(2000).refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use an https:// address without a login in it"),
  secret: z.string().trim().min(16, "Use a secret of at least 16 characters").max(200),
});

export const CHAT_CONFIG_SCHEMAS = { SLACK: slack, DISCORD: discord, MATTERMOST: mattermost, TELEGRAM: telegram, WHATSAPP: whatsapp, WEBHOOK: webhook } as const;
export type ChatConfig = { SLACK: z.infer<typeof slack>; DISCORD: z.infer<typeof discord>; MATTERMOST: z.infer<typeof mattermost>; TELEGRAM: z.infer<typeof telegram>; WHATSAPP: z.infer<typeof whatsapp>; WEBHOOK: z.infer<typeof webhook> };

const tail = (value: string) => `••••${value.slice(-4)}`;

/** A safe description of where a channel posts, for the settings page (no secrets). */
export function describeTarget(kind: ChatKind, config: ChatConfig[ChatKind]) {
  switch (kind) {
    case "SLACK": return `Slack webhook ${tail((config as ChatConfig["SLACK"]).webhookUrl)}`;
    case "DISCORD": return `Discord webhook ${tail((config as ChatConfig["DISCORD"]).webhookUrl)}`;
    case "MATTERMOST": return `${new URL((config as ChatConfig["MATTERMOST"]).webhookUrl).host} webhook ${tail((config as ChatConfig["MATTERMOST"]).webhookUrl)}`;
    case "TELEGRAM": return `Telegram chat ${(config as ChatConfig["TELEGRAM"]).chatId}`;
    case "WEBHOOK": return `Signed webhook ${new URL((config as ChatConfig["WEBHOOK"]).url).host}`;
    case "WHATSAPP": {
      const numbers = (config as ChatConfig["WHATSAPP"]).recipients;
      return `WhatsApp ${tail(numbers[0])}${numbers.length > 1 ? ` and ${numbers.length - 1} more` : ""}`;
    }
  }
}
