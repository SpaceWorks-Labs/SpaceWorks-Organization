import "server-only";

import crypto from "node:crypto";
import { assertPublicHost } from "@/lib/net/publicHost";
import type { ChatConfig } from "./config";
import type { ChatKind } from "./events";

/** The destination no longer exists or no longer accepts us (webhook deleted, bot removed, token revoked). */
export class ChatGoneError extends Error {
  override name = "ChatGoneError";
}

/** A send that failed for now; retryable failures are tried again by the queue. */
export class ChatSendError extends Error {
  override name = "ChatSendError";
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

/** Headers that sign a body: HMAC-SHA256 over "timestamp.body", so a receiver can check who sent it and when. */
export function signWebhook(secret: string, body: string, now = Date.now()) {
  const timestamp = String(Math.floor(now / 1000));
  return { "x-spaceworks-timestamp": timestamp, "x-spaceworks-signature": `sha256=${crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex")}` };
}

async function post(url: string, body: unknown, headers: Record<string, string> = {}, goneStatuses = [401, 403, 404, 410], signingSecret?: string) {
  let response: Response;
  const raw = JSON.stringify(body);
  try {
    // Never follow redirects: a destination must not bounce us somewhere else.
    response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers, ...(signingSecret ? signWebhook(signingSecret, raw) : {}) }, body: raw, redirect: "error", signal: AbortSignal.timeout(10_000), cache: "no-store" });
  } catch {
    throw new ChatSendError("The chat service could not be reached.", true);
  }
  if (response.ok) return;
  if (goneStatuses.includes(response.status)) throw new ChatGoneError(`The chat service refused the message (${response.status}). Check the channel's settings.`);
  throw new ChatSendError(`The chat service answered ${response.status}.`, response.status === 429 || response.status >= 500);
}

/** WhatsApp template parameters may not contain line breaks, tabs or runs of spaces. */
export function whatsappParameter(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 1000);
}

/** Post one plain-text message to a channel. */
export async function sendChatMessage(kind: ChatKind, config: ChatConfig[ChatKind], text: string) {
  switch (kind) {
    case "SLACK": {
      const { webhookUrl } = config as ChatConfig["SLACK"];
      return post(webhookUrl, { text, unfurl_links: false, unfurl_media: false });
    }
    case "DISCORD": {
      const { webhookUrl } = config as ChatConfig["DISCORD"];
      return post(webhookUrl, { content: text.slice(0, 2000), allowed_mentions: { parse: [] } });
    }
    case "MATTERMOST": {
      const { webhookUrl } = config as ChatConfig["MATTERMOST"];
      await assertPublicHost(new URL(webhookUrl).hostname);
      return post(webhookUrl, { text });
    }
    case "WEBHOOK": {
      const { url, secret } = config as ChatConfig["WEBHOOK"];
      await assertPublicHost(new URL(url).hostname);
      return post(url, { text }, {}, [401, 403, 404, 410], secret);
    }
    case "TELEGRAM": {
      const { botToken, chatId } = config as ChatConfig["TELEGRAM"];
      return post(`https://api.telegram.org/bot${botToken}/sendMessage`, { chat_id: chatId, text: text.slice(0, 4096), disable_web_page_preview: true }, {}, [400, 401, 403, 404]);
    }
    case "WHATSAPP": {
      const { phoneNumberId, accessToken, recipients, templateName, language } = config as ChatConfig["WHATSAPP"];
      for (const to of recipients) {
        await post(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
          messaging_product: "whatsapp",
          to: to.replace(/^\+/, ""),
          type: "template",
          template: { name: templateName, language: { code: language }, components: [{ type: "body", parameters: [{ type: "text", text: whatsappParameter(text) }] }] },
        }, { authorization: `Bearer ${accessToken}` }, [401, 403, 404]);
      }
    }
  }
}
