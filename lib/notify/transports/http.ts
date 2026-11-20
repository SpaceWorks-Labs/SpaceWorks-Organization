import { ChannelError } from "../errors";

export type Reply = { status: number; json: Record<string, unknown> | null };

/**
 * One request to a messaging provider. Never follows redirects, times out after 15 seconds and keeps every failure
 * message free of tokens and addresses. HTTPS only, except outside production, where tests point it at a local server.
 */
export async function request(url: string, init: { method?: string; headers?: Record<string, string>; body?: string; json?: unknown }): Promise<Reply> {
  if (!url.startsWith("https://") && !(process.env.NODE_ENV !== "production" && url.startsWith("http://"))) throw new ChannelError("Messaging providers are only reached over HTTPS.", false);
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? "POST",
      headers: { ...(init.json !== undefined ? { "content-type": "application/json" } : {}), ...init.headers },
      body: init.method === "GET" ? undefined : init.json !== undefined ? JSON.stringify(init.json) : init.body,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new ChannelError("The messaging provider could not be reached.", true);
  }
  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: response.status, json: json && typeof json === "object" && !Array.isArray(json) ? json : null };
}

/** The error for a status the provider answered with: credentials and bad addresses are permanent, throttling and outages retried. */
export function statusFailure(provider: string, status: number): ChannelError {
  if (status === 401 || status === 403) return new ChannelError(`${provider} refused the credentials or the recipient. Check the settings.`, false, status);
  if (status === 429 || status >= 500) return new ChannelError(`${provider} is busy or unavailable (${status}).`, true, status);
  return new ChannelError(`${provider} refused the message (${status}).`, false, status);
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
