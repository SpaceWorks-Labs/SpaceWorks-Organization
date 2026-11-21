/**
 * An organisation's own wording for member messages (Settings → Email). Pure and client-safe, so the editor's
 * live preview and the sender render the same way. A template is plain text with placeholders: blank lines
 * split the body into paragraphs, and `sendBrandedEmail` escapes every one, so nothing typed here is ever HTML.
 * Each kind also has a short text for SMS, WhatsApp, Telegram, Slack, Discord and Mattermost.
 */
import { MEMBER_MESSAGE_KINDS, MESSAGE_KIND_LABELS, MESSAGE_PLACEHOLDERS, type MemberMessageKind, type MessagePlaceholder } from "@/lib/messages/kinds";
import { STANDARD_MESSAGES, type EmailTemplateText, type MessageTemplate } from "@/lib/messages/standard";

export type { EmailTemplateText, MessageTemplate };
export const EMAIL_TEMPLATE_KINDS = MEMBER_MESSAGE_KINDS;
export type EmailTemplateKind = MemberMessageKind;

export const EMAIL_TEMPLATE_LABELS = MESSAGE_KIND_LABELS;

export const PLACEHOLDERS = MESSAGE_PLACEHOLDERS;
export type Placeholder = MessagePlaceholder;
export type PlaceholderValues = Partial<Record<Placeholder, string | null>>;

export const TEMPLATE_LIMITS = { subject: 150, heading: 150, body: 5000, short: 1000 } as const;

/** Today's wording, written with placeholders: what the editor starts from. */
export const STANDARD_TEMPLATES: Record<EmailTemplateKind, MessageTemplate> = STANDARD_MESSAGES;

/** Sample values for the editor's preview and "Send me a test". */
export function sampleValues(organisation: string): Record<Placeholder, string> {
  return {
    name: "Asha Menon", organisation, plan: "Annual membership", unit: "North 1", cardNumber: "EXN-0042", certificate: "Certificate of appreciation", certificateNumber: "CA-0007", validUntil: "31 Mar 2027",
    amount: "₹1,180.00", dueDate: "7 Apr 2027", payLink: "https://example.org/pay/sample", graceUntil: "30 Apr 2027",
    paymentInstructions: "Pay by UPI to example@bank and quote your name.",
  };
}

const isPlaceholder = (key: string): key is Placeholder => (PLACEHOLDERS as readonly string[]).includes(key);

/** Replace known placeholders. Unknown ones stay as typed; a known one with no value becomes empty. */
export function fillPlaceholders(text: string, values: PlaceholderValues): string {
  return text.replace(/\{([A-Za-z]+)\}/g, (match, key: string) => (isPlaceholder(key) ? (values[key] ?? "") : match));
}

/** Blank lines separate paragraphs; single line breaks stay inside a paragraph. */
export function paragraphsOf(body: string): string[] {
  return body.replace(/\r\n?/g, "\n").split(/\n[ \t]*\n/).map((part) => part.trim()).filter(Boolean);
}

/** The email parts `sendBrandedEmail` takes, from a template and the values for one member. */
export function renderEmailTemplate(template: EmailTemplateText, values: PlaceholderValues) {
  const line = (text: string) => fillPlaceholders(text, values).replace(/\s+/g, " ").trim();
  return { subject: line(template.subject), heading: line(template.heading), paragraphs: paragraphsOf(fillPlaceholders(template.body, values)) };
}

/** The short text for chat and text-message channels: one plain line of text, never HTML. */
export function renderShortText(short: string, values: PlaceholderValues): string {
  return fillPlaceholders(short, values).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** Why a template can't be saved, or null. The short text may be empty: the standard short text is then used. */
export function templateProblem(template: EmailTemplateText & { short?: string }): string | null {
  for (const key of ["subject", "heading", "body"] as const) {
    const value = template[key].trim();
    if (!value) return `Add the ${key}.`;
    if (value.length > TEMPLATE_LIMITS[key]) return `Keep the ${key} to ${TEMPLATE_LIMITS[key]} characters.`;
  }
  if ((template.short ?? "").trim().length > TEMPLATE_LIMITS.short) return `Keep the short text to ${TEMPLATE_LIMITS.short} characters.`;
  return null;
}
