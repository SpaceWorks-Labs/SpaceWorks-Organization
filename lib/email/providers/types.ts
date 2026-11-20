import type Mail from "nodemailer/lib/mailer";

/** What every outgoing email transport accepts: the same options nodemailer takes. */
export type MailOptions = Mail.Options;

/** What a transport returns once the provider has accepted (or refused) the recipient. */
export type MailResult = { accepted?: unknown; rejected?: unknown };

/** One interface for SMTP and the HTTPS providers, so the sending code never cares which is behind it. */
export interface Mailer {
  sendMail(options: MailOptions): Promise<MailResult>;
  close?(): void;
}

/**
 * A send the provider did not accept. `retryable` is true for network errors, 429 and 5xx; false when the
 * provider refused the message or our credentials. The message is safe to show: it never carries a secret.
 */
export class EmailProviderError extends Error {
  override name = "EmailProviderError";
  constructor(message: string, readonly retryable: boolean, readonly status?: number) {
    super(message);
  }
}

/** The address of a recipient given as a string or { name, address }. */
export function addressOf(value: unknown): string {
  if (typeof value === "string") return (value.match(/<([^>]+)>/)?.[1] ?? value).trim();
  if (value && typeof value === "object" && "address" in value) return String((value as { address: unknown }).address).trim();
  return "";
}

/** "Name" <address> for a sender, with quotes and line breaks stripped from the name. */
export function formatFrom(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "address" in value) {
    const { name, address } = value as { name?: string; address: string };
    const clean = (name ?? "").replace(/["\r\n<>]/g, "").trim();
    return clean ? `"${clean}" <${address}>` : address;
  }
  return "";
}

export function recipientsOf(to: unknown): string[] {
  return (Array.isArray(to) ? to : [to]).map(addressOf).filter(Boolean);
}

/** The outbox id from a `<swo-ID@outbox.invalid>` message id: the idempotency key and de-duplication handle. */
export function outboxKey(messageId: string | undefined) {
  const match = messageId?.match(/^<?(swo-[A-Za-z0-9_-]{1,64})@/);
  return match?.[1];
}

/** Attachments as base64, for providers that take JSON. */
export function attachmentsOf(options: MailOptions) {
  return (options.attachments ?? []).flatMap((item) => {
    if (!Buffer.isBuffer(item.content)) return [];
    return [{ filename: item.filename ?? "attachment", content: item.content.toString("base64"), contentType: item.contentType }];
  });
}

const TIMEOUT_MS = 20_000;

/** POST JSON over HTTPS to a fixed provider host. Never follows redirects. Maps network failures to EmailProviderError. */
export async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<{ status: number; json: unknown }> {
  if (!url.startsWith("https://")) throw new EmailProviderError("Email providers are only reached over HTTPS.", false);
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch {
    throw new EmailProviderError("The email provider could not be reached.", true);
  }
  const json = await response.json().catch(() => null);
  return { status: response.status, json };
}

/** Status codes shared by every provider: credential problems are permanent, throttling and outages are retried. */
export function statusError(provider: string, status: number): EmailProviderError {
  if (status === 401 || status === 403) return new EmailProviderError(`${provider} refused the credentials. Check the key.`, false, status);
  if (status === 429 || status >= 500) return new EmailProviderError(`${provider} is busy or unavailable (${status}).`, true, status);
  return new EmailProviderError(`${provider} refused the message (${status}).`, false, status);
}
