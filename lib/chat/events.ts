/** Team alerts a chat channel can receive. Client-safe; the database checks the same list (migration 0011). */
export const CHAT_EVENTS = ["application", "payment", "payment-to-confirm", "refund-requested", "erasure-requested", "member-left", "monthly-summary"] as const;
export type ChatEvent = (typeof CHAT_EVENTS)[number];

export const CHAT_EVENT_LABELS: Record<ChatEvent, string> = {
  application: "New application to review",
  payment: "Payment received",
  "payment-to-confirm": "Payment waiting to be confirmed",
  "refund-requested": "Member asked for a refund",
  "erasure-requested": "Member asked to erase their details",
  "member-left": "Member left",
  "monthly-summary": "Monthly summary",
};

export const CHAT_KINDS = ["SLACK", "DISCORD", "MATTERMOST", "TELEGRAM", "WHATSAPP", "WEBHOOK"] as const;
export type ChatKind = (typeof CHAT_KINDS)[number];

export const CHAT_KIND_LABELS: Record<ChatKind, string> = {
  SLACK: "Slack",
  DISCORD: "Discord",
  MATTERMOST: "Mattermost",
  TELEGRAM: "Telegram",
  WHATSAPP: "WhatsApp",
  WEBHOOK: "Signed webhook",
};

/** The WhatsApp message template organisations create and get approved in Meta's WhatsApp Manager. */
export const WHATSAPP_TEMPLATE = { name: "team_alert", language: "en", body: "{{1}}" } as const;
