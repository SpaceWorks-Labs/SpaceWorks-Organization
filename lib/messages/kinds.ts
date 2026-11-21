/**
 * What the platform says to members, and where. Client-safe: the editors, the routing form and the senders share
 * these lists. Adding a kind means adding its standard wording (`standard.ts`) and, if it needs a WhatsApp template,
 * nothing else: templates are mapped per kind by the organisation.
 */

export const MEMBER_MESSAGE_KINDS = [
  "application-received",
  "application-approved",
  "application-declined",
  "payment-due",
  "payment-received",
  "membership-activated",
  "membership-renewed",
  "renewal-due",
  "renewal-today",
  "grace-started",
  "grace-ending",
  "lapsed",
  "payment-claim-pending",
  "card-issued",
  "certificate-issued",
  "refund-decided",
  "membership-revoked",
  "membership-left",
] as const;
export type MemberMessageKind = (typeof MEMBER_MESSAGE_KINDS)[number];

export const isMemberMessageKind = (value: unknown): value is MemberMessageKind => (MEMBER_MESSAGE_KINDS as readonly string[]).includes(value as string);

export const MESSAGE_KIND_LABELS: Record<MemberMessageKind, { title: string; description: string; staff?: boolean }> = {
  "application-received": { title: "Application received", description: "Sent when someone applies and the team has yet to decide." },
  "application-approved": { title: "Application approved", description: "Sent when an application is approved. Carries the pay link when money is due." },
  "application-declined": { title: "Application declined", description: "Sent when an application is not approved." },
  "payment-due": { title: "Payment due", description: "Sent when a membership starts once payment is made." },
  "payment-received": { title: "Payment received", description: "Sent when a payment is received. Email carries the receipt as a PDF." },
  "membership-activated": { title: "Membership started", description: "Sent when a membership becomes active." },
  "membership-renewed": { title: "Renewal confirmed", description: "Sent when a renewal is confirmed." },
  "renewal-due": { title: "Renewal due", description: "Sent the days before a membership ends that each plan sets." },
  "renewal-today": { title: "Membership ends today", description: "Sent on the day a membership ends." },
  "grace-started": { title: "Grace period started", description: "Sent once, when a membership ends and the grace period begins." },
  "grace-ending": { title: "Grace period ending", description: "Sent once, a few days before the grace period ends." },
  lapsed: { title: "Membership lapsed", description: "Sent once a membership has lapsed, and with the reminders a plan sets after the end." },
  "payment-claim-pending": { title: "Payment being checked", description: "Sent when a member says they paid and the team has still not confirmed it a day later. Staff get a chat alert too.", staff: true },
  "card-issued": { title: "Membership card", description: "Sent when a card is first issued, and when you email a card. Email carries the card as a PDF." },
  "certificate-issued": { title: "Certificate", description: "Sent when you email a certificate. Email carries the certificate as a PDF, with a link to check it." },
  "refund-decided": { title: "Refund decision", description: "Sent to the member who asked for a refund once the team has decided." },
  "membership-revoked": { title: "Membership revoked", description: "Sent when the team revokes a membership, with the note they gave." },
  "membership-left": { title: "Membership ended by the member", description: "Sent when a member ends their own membership from their account." },
};

/** Kinds that carry a PDF on email (a receipt, a card). Other channels get the short text only. */
export const KINDS_WITH_ATTACHMENT: readonly MemberMessageKind[] = ["payment-received", "card-issued", "certificate-issued", "refund-decided"];

export const MESSAGE_PLACEHOLDERS = ["name", "organisation", "plan", "unit", "cardNumber", "certificate", "certificateNumber", "validUntil", "amount", "dueDate", "payLink", "graceUntil", "paymentInstructions"] as const;
export type MessagePlaceholder = (typeof MESSAGE_PLACEHOLDERS)[number];

/** Variables a WhatsApp template may take, in the order the organisation lists them: the placeholders and the stop link. */
export const WHATSAPP_VARIABLES = [...MESSAGE_PLACEHOLDERS, "stopLink"] as const;
export type WhatsAppVariable = (typeof WHATSAPP_VARIABLES)[number];

// ---------- channels ----------

export const MEMBER_CHANNELS = ["EMAIL", "SMS", "WHATSAPP", "TELEGRAM", "SLACK", "DISCORD", "MATTERMOST"] as const;
export type MemberChannel = (typeof MEMBER_CHANNELS)[number];
/** Every channel that needs a connection and a linked address. Email uses the member's own address and the email providers. */
export const CONFIGURABLE_CHANNELS = ["SMS", "WHATSAPP", "TELEGRAM", "SLACK", "DISCORD", "MATTERMOST"] as const;
export type ConfigurableChannel = (typeof CONFIGURABLE_CHANNELS)[number];

export const isMemberChannel = (value: unknown): value is MemberChannel => (MEMBER_CHANNELS as readonly string[]).includes(value as string);
export const isConfigurableChannel = (value: unknown): value is ConfigurableChannel => (CONFIGURABLE_CHANNELS as readonly string[]).includes(value as string);

export const CHANNEL_LABELS: Record<MemberChannel, string> = { EMAIL: "Email", SMS: "Text message", WHATSAPP: "WhatsApp", TELEGRAM: "Telegram", SLACK: "Slack", DISCORD: "Discord", MATTERMOST: "Mattermost" };

/** Channel to channel list per kind. Without a saved routing, every kind goes by email. */
export type Routing = Partial<Record<MemberMessageKind, MemberChannel[]>>;
export const DEFAULT_ROUTE: readonly MemberChannel[] = ["EMAIL"];
export const MAX_ROUTE_LENGTH = 4;

/** The saved routing, cleaned: known kinds, known channels, no repeats, a short list. */
export function cleanRouting(value: unknown): Routing {
  const out: Routing = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [kind, list] of Object.entries(value as Record<string, unknown>)) {
    if (!isMemberMessageKind(kind) || !Array.isArray(list)) continue;
    const channels = [...new Set(list.filter(isMemberChannel))].slice(0, MAX_ROUTE_LENGTH);
    if (channels.length) out[kind] = channels;
  }
  return out;
}

export const routeFor = (routing: Routing, kind: MemberMessageKind): readonly MemberChannel[] => routing[kind] ?? DEFAULT_ROUTE;

/** Days before the end that "grace ending" goes out, counted from the end of the grace period. */
export const GRACE_ENDING_DAYS = 3;
/** Hours a member's "I've paid" claim may wait before the member is told it is being checked and staff are alerted. */
export const CLAIM_PENDING_HOURS = 24;

/** The kind a plan's renewal reminder key belongs to: `before-0` is the end date, `before-N` the days leading up to it, `after-N` once it has passed. */
export function reminderKindFor(key: string): MemberMessageKind {
  return key === "before-0" ? "renewal-today" : key.startsWith("after") ? "lapsed" : "renewal-due";
}
