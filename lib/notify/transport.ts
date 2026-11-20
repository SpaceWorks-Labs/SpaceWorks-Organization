import { buildSmsSender, type SmsConfig } from "@/lib/sms/config";
import { SmsProviderError } from "@/lib/sms/providers/types";
import type { ConfigurableChannel } from "@/lib/messages/kinds";
import { ChannelError } from "./errors";
import type { StoredConfig } from "./config";
import { discordTransport } from "./transports/discord";
import { mattermostTransport } from "./transports/mattermost";
import { slackTransport } from "./transports/slack";
import { telegramTransport } from "./transports/telegram";
import { metaWhatsApp, twilioWhatsApp } from "./transports/whatsapp";

export type Outgoing = {
  /** The person's address on the channel: a phone number (E.164), a Telegram chat id or a Slack, Discord or Mattermost user id. */
  identity: string;
  text: string;
  /** The outbox id, for providers that take an idempotency token. */
  key?: string;
  /** WhatsApp only: the approved template and its ordered variables. */
  template?: { name: string; language: string; variables: string[] };
};

type Connection = { channel: ConfigurableChannel; provider: string; config: StoredConfig; smsConfig?: SmsConfig };

/** The platform's SMS fields (Twilio, MSG91) from a channel's generic ones. */
export function toSmsConfig(provider: string, config: StoredConfig): SmsConfig {
  return provider === "msg91"
    ? { msg91AuthKey: config.authKey, msg91TemplateId: config.templateId, msg91SenderId: config.senderId }
    : { twilioAccountSid: config.accountSid, twilioAuthToken: config.authToken, twilioFrom: config.from, twilioMessagingServiceSid: config.messagingServiceSid };
}

const text = (config: StoredConfig, key: string) => config[key] ?? "";

async function viaSms(connection: Connection, out: Outgoing) {
  const config = connection.smsConfig ?? toSmsConfig(connection.provider, connection.config);
  try {
    const sender = buildSmsSender(connection.provider as "twilio" | "msg91", config);
    // MSG91's flow takes the whole message as its one variable; Twilio sends the text as it is.
    return await sender.send({ to: out.identity, text: out.text, code: out.text, brand: "", key: out.key });
  } catch (error) {
    if (error instanceof SmsProviderError) throw new ChannelError(error.message, error.retryable, error.status);
    throw error;
  }
}

/** Send one message to one person through a connection. Throws ChannelError; the message never carries a secret or an address. */
export async function sendVia(connection: Connection, out: Outgoing): Promise<{ providerRef?: string }> {
  const { channel, provider, config } = connection;
  switch (channel) {
    case "SMS": return viaSms(connection, out);
    case "TELEGRAM": return telegramTransport({ botToken: text(config, "botToken") }).send(out.identity, out.text);
    case "SLACK": return slackTransport({ botToken: text(config, "botToken") }).send(out.identity, out.text);
    case "DISCORD": return discordTransport({ botToken: text(config, "botToken") }).send(out.identity, out.text);
    case "MATTERMOST": return mattermostTransport({ serverUrl: text(config, "serverUrl"), botToken: text(config, "botToken") }).send(out.identity, out.text);
    case "WHATSAPP": {
      if (!out.template) throw new ChannelError("WhatsApp needs an approved template for this message.", false);
      const message = { to: out.identity, template: out.template.name, language: out.template.language, variables: out.template.variables, key: out.key };
      return provider === "meta"
        ? metaWhatsApp({ phoneNumberId: text(config, "phoneNumberId"), accessToken: text(config, "accessToken") }).send(message)
        : twilioWhatsApp({ accountSid: text(config, "accountSid"), authToken: text(config, "authToken"), from: text(config, "from") }).send(message);
    }
  }
}

/** Prove the credentials work without messaging anyone. SMS is tested by texting a number, so it is not here. */
export async function verifyConnection(connection: Connection): Promise<void> {
  const { channel, provider, config } = connection;
  switch (channel) {
    case "TELEGRAM": await telegramTransport({ botToken: text(config, "botToken") }).me(); return;
    case "SLACK": return slackTransport({ botToken: text(config, "botToken") }).verify();
    case "DISCORD": return discordTransport({ botToken: text(config, "botToken") }).verify();
    case "MATTERMOST": return mattermostTransport({ serverUrl: text(config, "serverUrl"), botToken: text(config, "botToken") }).verify();
    case "WHATSAPP":
      return provider === "meta"
        ? metaWhatsApp({ phoneNumberId: text(config, "phoneNumberId"), accessToken: text(config, "accessToken") }).verify()
        : twilioWhatsApp({ accountSid: text(config, "accountSid"), authToken: text(config, "authToken"), from: text(config, "from") }).verify();
    case "SMS": return;
  }
}
