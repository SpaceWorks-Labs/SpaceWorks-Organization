import "server-only";

import { reply, scopeOf } from "./common";
import { discordWebhook } from "./discord";
import { mattermostWebhook } from "./mattermost";
import { slackWebhook } from "./slack";
import { telegramWebhook } from "./telegram";
import { metaWhatsAppWebhook, twilioWebhook } from "./whatsapp";

/**
 * Inbound messaging webhooks, one address per provider and connection:
 * `/api/messaging/webhooks/<provider>?scope=<platform or organisation id>`. Each handler verifies its provider's
 * signature or token before it reads anything.
 */
export async function handleMessagingWebhook(provider: string, request: Request): Promise<Response> {
  const scope = scopeOf(request);
  if (scope === undefined) return reply(404);
  if (request.method === "GET") return provider === "whatsapp-meta" ? metaWhatsAppWebhook(request, scope) : reply(404);
  switch (provider) {
    case "telegram": return telegramWebhook(request, scope);
    case "slack": return slackWebhook(request, scope);
    case "discord": return discordWebhook(request, scope);
    case "mattermost": return mattermostWebhook(request, scope);
    case "whatsapp-meta": return metaWhatsAppWebhook(request, scope);
    case "twilio": return twilioWebhook(request, scope);
    default: return reply(404);
  }
}
