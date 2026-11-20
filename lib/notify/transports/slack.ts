import { ChannelError } from "../errors";
import { bearer, request, statusFailure } from "./http";

const API = "https://slack.com/api";
const RETRY = new Set(["ratelimited", "rate_limited", "service_unavailable", "internal_error", "fatal_error", "request_timeout"]);

/** Slack answers 200 even for failures: the reason is in `error`. */
function failure(status: number, json: Record<string, unknown> | null): ChannelError {
  if (status !== 200) return statusFailure("Slack", status);
  const code = typeof json?.error === "string" ? json.error : "";
  return new ChannelError(RETRY.has(code) ? "Slack is busy. Trying again shortly." : "Slack refused the message or the credentials. Check the app's settings.", RETRY.has(code));
}

export function slackTransport(config: { botToken: string }, base = API) {
  const headers = bearer(config.botToken);
  return {
    /** A direct message: posting to a user's id opens the app's conversation with them. */
    async send(to: string, text: string) {
      const { status, json } = await request(`${base}/chat.postMessage`, { headers, json: { channel: to, text, unfurl_links: false, unfurl_media: false } });
      if (status === 200 && json?.ok === true && typeof json.ts === "string") return { providerRef: json.ts };
      throw failure(status, json);
    },
    async verify() {
      const { status, json } = await request(`${base}/auth.test`, { headers, body: "" });
      if (status === 200 && json?.ok === true) return;
      throw failure(status, json);
    },
  };
}
