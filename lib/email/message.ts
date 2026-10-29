import { assertEmailAccepted, getEmailTransport } from "./transporter";
import { organisationEmailTransport } from "./orgTransport";
import { EMAIL_BUTTON_STYLE, EMAIL_COLORS, emailLayout } from "./brand";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]!);
}

type BrandedEmail = {
  to: string;
  subject: string;
  heading: string;
  /** Plain-text paragraphs; escaped for HTML. */
  paragraphs: string[];
  action?: { label: string; url: string };
  /** Small print under the action, e.g. how long a link lasts. */
  footnote?: string;
  messageId?: string;
  /** Sent on behalf of this organisation: its own SMTP if set up, otherwise the platform's in its name. */
  organisationId?: string;
  /** Attachments such as a receipt PDF or a membership card. */
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
};

/** Render a branded email as text and HTML with one optional action button. */
export function renderBrandedEmail(email: Omit<BrandedEmail, "to" | "messageId" | "attachments">) {
  const paragraph = (text: string) => `<p style="font-size:16px;line-height:1.5;color:${EMAIL_COLORS.inkMuted};margin:0 0 16px">${escapeHtml(text)}</p>`;
  const action = email.action
    ? `<p style="text-align:center;margin:32px 0"><a href="${escapeHtml(email.action.url)}" style="${EMAIL_BUTTON_STYLE}">${escapeHtml(email.action.label)}</a></p>`
    : "";
  const footnote = email.footnote ? `<p style="font-size:13px;color:${EMAIL_COLORS.inkMuted};overflow-wrap:anywhere;margin:0">${escapeHtml(email.footnote)}</p>` : "";
  const html = emailLayout(
    escapeHtml(email.heading),
    `<h2 style="margin-top:0;color:${EMAIL_COLORS.ink};font-size:20px;font-weight:700">${escapeHtml(email.heading)}</h2>${email.paragraphs.map(paragraph).join("")}${action}${footnote}`,
  );
  const text = [email.heading, "", ...email.paragraphs.flatMap((p) => [p, ""]), ...(email.action ? [`${email.action.label}: ${email.action.url}`, ""] : []), ...(email.footnote ? [email.footnote] : [])].join("\n").trim();
  return { html, text };
}

/** Subjects carry user-entered names: keep them to one line. */
function cleanSubject(subject: string) {
  return subject.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 200);
}

/** Send a branded email. Without SMTP configured it is a no-op that never logs the recipient or links. */
export async function sendBrandedEmail(email: BrandedEmail): Promise<void> {
  const { transporter, from, replyTo } = email.organisationId ? await organisationEmailTransport(email.organisationId) : { ...(await getEmailTransport()), replyTo: undefined };
  const { html, text } = renderBrandedEmail(email);
  if (!transporter) {
    console.log(`[EMAIL MOCK] ${email.subject.slice(0, 80)} queued`);
    return;
  }
  const result = await transporter.sendMail({ messageId: email.messageId, from, replyTo, to: email.to, subject: cleanSubject(email.subject), text, html, attachments: email.attachments });
  assertEmailAccepted(result);
}

export function absoluteUrl(path: string) {
  const base = (process.env.NEXT_PUBLIC_BASE_URL || process.env.AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
