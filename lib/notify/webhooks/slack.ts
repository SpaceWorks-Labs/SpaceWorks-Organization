import "server-only";

import { channelForScope } from "../store";
import { slackTransport } from "../transports/slack";
import { verifySlackSignature } from "../verify";
import { handleText, readBody, reply } from "./common";

type SlackPayload = { type?: unknown; challenge?: unknown; event?: { type?: unknown; channel_type?: unknown; user?: unknown; text?: unknown; bot_id?: unknown; subtype?: unknown } };

/** A Slack event. Verified by the signing secret (and a five-minute window); direct messages to the app link or stop. */
export async function slackWebhook(request: Request, scopeOrgId: string | null): Promise<Response> {
  const resolved = await channelForScope(scopeOrgId, "SLACK");
  if (!resolved) return reply(404);
  const body = await readBody(request);
  if (body === null) return reply(413);
  if (!verifySlackSignature(resolved.config.signingSecret ?? "", request.headers.get("x-slack-request-timestamp"), body, request.headers.get("x-slack-signature"))) return reply(401, { error: "Not verified." });
  let payload: SlackPayload;
  try {
    payload = JSON.parse(body);
  } catch {
    return reply(400);
  }
  if (payload.type === "url_verification" && typeof payload.challenge === "string") return reply(200, { challenge: payload.challenge });
  // Slack retries slow answers; the first delivery already did the work.
  if (request.headers.get("x-slack-retry-num")) return reply(200);
  const event = payload.event;
  if (event?.type !== "message" || event.channel_type !== "im" || event.bot_id || event.subtype || typeof event.user !== "string" || typeof event.text !== "string") return reply(200);
  const answer = await handleText({ scopeOrgId, channel: "SLACK", identity: event.user, text: event.text.slice(0, 200) });
  if (answer) await slackTransport({ botToken: resolved.config.botToken ?? "" }).send(event.user, answer).catch(() => undefined);
  return reply(200);
}
