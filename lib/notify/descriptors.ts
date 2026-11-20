import type { ConfigurableChannel } from "@/lib/messages/kinds";

/**
 * What each member channel needs to connect. Client-safe: the settings forms are drawn from it and the server
 * validates against it, so a field exists in exactly one place. Secrets are write-only (blank keeps the saved one).
 */
export type FieldSpec = { key: string; label: string; secret?: boolean; optional?: boolean; hint?: string; pattern?: string; message?: string };
export type ProviderSpec = { id: string; label: string; fields: FieldSpec[] };
export type ChannelSpec = { providers: ProviderSpec[]; about: string };

const E164 = "^\\+[1-9]\\d{6,14}$";

export const CHANNEL_SPECS: Record<ConfigurableChannel, ChannelSpec> = {
  SMS: {
    about: "Text messages to a member's verified number. Platform-wide, this is the provider set up under Auth, which also carries phone codes.",
    providers: [
      { id: "twilio", label: "Twilio", fields: [
        { key: "accountSid", label: "Account SID", pattern: "^AC[0-9a-fA-F]{32}$", message: "Enter the account SID, which starts with AC" },
        { key: "authToken", label: "Auth token", secret: true },
        { key: "from", label: "Sending number", optional: true, pattern: E164, message: "Use the number with its country code, such as +15551234567" },
        { key: "messagingServiceSid", label: "Messaging service SID", optional: true, pattern: "^MG[0-9a-fA-F]{32}$", message: "Enter the messaging service SID, which starts with MG" },
      ] },
      { id: "msg91", label: "MSG91", fields: [
        { key: "authKey", label: "Auth key", secret: true },
        { key: "templateId", label: "Flow template ID", pattern: "^[A-Za-z0-9_-]{1,64}$", message: "Use letters, numbers, hyphens and underscores", hint: "The flow needs one variable, which carries the whole message." },
        { key: "senderId", label: "Sender ID", optional: true, pattern: "^[A-Za-z0-9]{3,20}$", message: "Use 3 to 20 letters and numbers" },
      ] },
    ],
  },
  WHATSAPP: {
    about: "Business-initiated WhatsApp messages use templates approved by WhatsApp. Map each message to its template below.",
    providers: [
      { id: "twilio", label: "Twilio WhatsApp", fields: [
        { key: "accountSid", label: "Account SID", pattern: "^AC[0-9a-fA-F]{32}$", message: "Enter the account SID, which starts with AC" },
        { key: "authToken", label: "Auth token", secret: true, hint: "Also verifies replies and delivery reports." },
        { key: "from", label: "WhatsApp sender", pattern: E164, message: "Use the sender's number with its country code", hint: "Templates are Twilio content SIDs (HX...)." },
      ] },
      { id: "meta", label: "Meta WhatsApp Cloud API", fields: [
        { key: "phoneNumberId", label: "Phone number ID", pattern: "^\\d{5,20}$", message: "Use the phone number ID from WhatsApp Manager" },
        { key: "accessToken", label: "Access token", secret: true },
        { key: "appSecret", label: "App secret", secret: true, hint: "Checks the signature on every report Meta sends." },
        { key: "verifyToken", label: "Webhook verify token", secret: true, pattern: "^[A-Za-z0-9_-]{16,100}$", message: "Use 16 to 100 letters, numbers, hyphens or underscores" },
      ] },
    ],
  },
  TELEGRAM: {
    about: "A bot members start from a link on their account page. Members must start the bot before it can message them.",
    providers: [{ id: "bot", label: "Telegram bot", fields: [
      { key: "botToken", label: "Bot token", secret: true, pattern: "^\\d{5,15}:[A-Za-z0-9_-]{30,64}$", message: "Paste the bot token from @BotFather" },
      { key: "botUsername", label: "Bot username", pattern: "^@?[A-Za-z][A-Za-z0-9_]{4,31}$", message: "Use the bot's username, such as MyOrgBot" },
    ] }],
  },
  SLACK: {
    about: "A Slack app that sends direct messages. Members link by sending the app a one-time code.",
    providers: [{ id: "app", label: "Slack app", fields: [
      { key: "botToken", label: "Bot token", secret: true, pattern: "^xoxb-[A-Za-z0-9-]{10,200}$", message: "Paste the bot token, which starts with xoxb-" },
      { key: "signingSecret", label: "Signing secret", secret: true, pattern: "^[A-Za-z0-9]{16,100}$", message: "Paste the app's signing secret" },
    ] }],
  },
  DISCORD: {
    about: "A Discord bot that sends direct messages. Members link with the bot's /link command.",
    providers: [{ id: "bot", label: "Discord bot", fields: [
      { key: "botToken", label: "Bot token", secret: true, pattern: "^[A-Za-z0-9._-]{30,120}$", message: "Paste the bot token" },
      { key: "publicKey", label: "Application public key", pattern: "^[0-9a-fA-F]{64}$", message: "Paste the 64-character public key from the developer portal" },
      { key: "applicationId", label: "Application ID", pattern: "^\\d{5,30}$", message: "Paste the application ID" },
    ] }],
  },
  MATTERMOST: {
    about: "A Mattermost bot account that sends direct messages. Members link with a /link slash command.",
    providers: [{ id: "bot", label: "Mattermost bot", fields: [
      { key: "serverUrl", label: "Server address", pattern: "^https://[A-Za-z0-9.-]+(:\\d{2,5})?/?$", message: "Use the server's https:// address, such as https://chat.example.org" },
      { key: "botToken", label: "Bot access token", secret: true, pattern: "^[A-Za-z0-9]{20,40}$", message: "Paste the bot account's access token" },
      { key: "slashToken", label: "Slash command token", secret: true, pattern: "^[A-Za-z0-9]{16,64}$", message: "Paste the /link slash command's token" },
    ] }],
  },
};

export const providerSpec = (channel: ConfigurableChannel, provider: string): ProviderSpec | undefined => CHANNEL_SPECS[channel].providers.find((item) => item.id === provider);
