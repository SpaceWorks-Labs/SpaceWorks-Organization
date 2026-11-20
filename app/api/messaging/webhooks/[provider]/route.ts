import { handleMessagingWebhook } from "@/lib/notify/webhooks";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ provider: string }> };

/** Replies and events from Telegram, Slack, Discord, Mattermost, WhatsApp (Meta) and Twilio. Verified before anything is read. */
export async function POST(request: Request, { params }: Context) {
  return handleMessagingWebhook((await params).provider, request);
}

/** Meta's webhook verification handshake. */
export async function GET(request: Request, { params }: Context) {
  return handleMessagingWebhook((await params).provider, request);
}
