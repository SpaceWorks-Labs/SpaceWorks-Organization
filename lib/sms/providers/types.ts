/** What a provider needs to send one message. `code` and `brand` travel separately for template-based providers. */
export type SmsMessage = {
  /** E.164, with the plus. */
  to: string;
  text: string;
  code: string;
  brand: string;
  /** The outbox id: the idempotency key where the provider has one. */
  key?: string;
  /** Where the provider reports delivery, when it takes a per-message address. */
  statusCallback?: string;
};

/** What a provider returns once it accepted the message: its own id for it, which delivery reports quote. */
export type SmsSendResult = { providerRef: string };

/** One interface for every SMS provider, so the sending code never cares which is behind it. */
export interface SmsSender {
  send(message: SmsMessage): Promise<SmsSendResult>;
}

/**
 * A send the provider did not accept. `retryable` is true for network errors, 429 and 5xx; false when the provider
 * refused the message or our credentials. The message is safe to show: it never carries a secret or a number.
 */
export class SmsProviderError extends Error {
  override name = "SmsProviderError";
  constructor(message: string, readonly retryable: boolean, readonly status?: number) {
    super(message);
  }
}

const TIMEOUT_MS = 20_000;

/** A request to a fixed provider host over HTTPS. Never follows redirects. Maps network failures to SmsProviderError. */
export async function providerRequest(url: string, init: { headers: Record<string, string>; body: string }): Promise<{ status: number; json: unknown }> {
  if (!url.startsWith("https://")) throw new SmsProviderError("SMS providers are only reached over HTTPS.", false);
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers: init.headers, body: init.body, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch {
    throw new SmsProviderError("The SMS provider could not be reached.", true);
  }
  const json = await response.json().catch(() => null);
  return { status: response.status, json };
}

/** Status codes shared by every provider: credential problems are permanent, throttling and outages are retried. */
export function statusError(provider: string, status: number): SmsProviderError {
  if (status === 401 || status === 403) return new SmsProviderError(`${provider} refused the credentials. Check the keys.`, false, status);
  if (status === 429 || status >= 500) return new SmsProviderError(`${provider} is busy or unavailable (${status}).`, true, status);
  return new SmsProviderError(`${provider} refused the message (${status}).`, false, status);
}
