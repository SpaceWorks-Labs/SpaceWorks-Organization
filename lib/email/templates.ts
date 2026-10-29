/**
 * An organisation's own wording for member emails (Settings → Email). Pure and client-safe, so the editor's
 * live preview and the sender render the same way. A template is plain text with placeholders: blank lines
 * split the body into paragraphs, and `sendBrandedEmail` escapes every one, so nothing typed here is ever HTML.
 */

export const EMAIL_TEMPLATE_KINDS = ["card-issued", "membership-activated"] as const;
export type EmailTemplateKind = (typeof EMAIL_TEMPLATE_KINDS)[number];

export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplateKind, { title: string; description: string }> = {
  "card-issued": { title: "Membership card", description: "Sent with the card as a PDF when a card is first issued, and when you email a card." },
  "membership-activated": { title: "Membership started", description: "Sent when a membership becomes active." },
};

export const PLACEHOLDERS = ["name", "organisation", "plan", "unit", "cardNumber", "validUntil"] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];
export type PlaceholderValues = Partial<Record<Placeholder, string | null>>;

export const TEMPLATE_LIMITS = { subject: 150, heading: 150, body: 5000 } as const;

export type EmailTemplateText = { subject: string; heading: string; body: string };

/** Today's wording, written with placeholders: what the editor starts from. */
export const STANDARD_TEMPLATES: Record<EmailTemplateKind, EmailTemplateText> = {
  "card-issued": {
    subject: "Your {organisation} membership card",
    heading: "Your membership card",
    body: "Hi {name}, your {plan} card from {organisation} is attached as a PDF. Print it on card stock or keep it on your phone.\n\nAnyone can scan the QR code on the front to check that your membership is current. Renewing keeps the same card.",
  },
  "membership-activated": {
    subject: "Welcome to {organisation}",
    heading: "Your membership has started",
    body: "Hi {name}, your {plan} membership with {organisation} is active until {validUntil}.",
  },
};

/** Sample values for the editor's preview and "Send me a test". */
export function sampleValues(organisation: string): Record<Placeholder, string> {
  return { name: "Asha Menon", organisation, plan: "Annual membership", unit: "North 1", cardNumber: "EXN-0042", validUntil: "31 Mar 2027" };
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

/** Why a template can't be saved, or null. */
export function templateProblem(template: EmailTemplateText): string | null {
  for (const key of ["subject", "heading", "body"] as const) {
    const value = template[key].trim();
    if (!value) return `Add the ${key}.`;
    if (value.length > TEMPLATE_LIMITS[key]) return `Keep the ${key} to ${TEMPLATE_LIMITS[key]} characters.`;
  }
  return null;
}
