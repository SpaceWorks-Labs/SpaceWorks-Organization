import "server-only";

import { channelForScope } from "../store";
import { telegramTransport } from "../transports/telegram";
import { verifyTelegramSecret } from "../verify";
import { handleText, readBody, reply } from "./common";

/** A Telegram update. Verified by the secret token Telegram repeats on every call; only private chats with the bot count. */
export async function telegramWebhook(request: Request, scopeOrgId: string | null): Promise<Response> {
  const resolved = await channelForScope(scopeOrgId, "TELEGRAM");
  if (!resolved) return reply(404);
  const body = await readBody(request);
  if (body === null) return reply(413);
  if (!verifyTelegramSecret(resolved.config.webhookSecret ?? "", request.headers.get("x-telegram-bot-api-secret-token"))) return reply(401, { error: "Not verified." });
  let update: { message?: { text?: unknown; chat?: { id?: unknown; type?: unknown } } };
  try {
    update = JSON.parse(body);
  } catch {
    return reply(400);
  }
  const message = update.message;
  if (typeof message?.text !== "string" || message.chat?.type !== "private" || typeof message.chat.id !== "number") return reply(200);
  const identity = String(message.chat.id);
  const answer = await handleText({ scopeOrgId, channel: "TELEGRAM", identity, text: message.text.slice(0, 200) });
  if (answer) await telegramTransport({ botToken: resolved.config.botToken ?? "" }).send(identity, answer).catch(() => undefined);
  return reply(200);
}
