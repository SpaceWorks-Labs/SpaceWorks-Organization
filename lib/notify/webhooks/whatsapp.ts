import "server-only";

import { verifyTwilioSignature } from "@/lib/sms/webhooks/verify";
import { isStopWord, stopFromReply } from "../consent";
import { recordDeliveryState } from "../deliver";
import { userForIdentity } from "../endpoints";
import { channelForScope } from "../store";
import { safeEqual, verifyMetaSignature } from "../verify";
import { readBody, reply } from "./common";

async function stopByNumber(scopeOrgId: string | null, channel: "WHATSAPP" | "SMS", number: string) {
  if (!/^\+[1-9]\d{6,14}$/.test(number)) return;
  const userId = await userForIdentity(scopeOrgId, channel, number);
  if (userId) await stopFromReply(userId, scopeOrgId, channel);
}

type MetaPayload = { entry?: Array<{ changes?: Array<{ value?: { messages?: Array<{ from?: unknown; text?: { body?: unknown } }>; statuses?: Array<{ id?: unknown; status?: unknown }> } }> }> };

/** Meta's webhook: the verification handshake (GET), then signed events (POST). STOP replies end consent; statuses update the log. */
export async function metaWhatsAppWebhook(request: Request, scopeOrgId: string | null): Promise<Response> {
  const resolved = await channelForScope(scopeOrgId, "WHATSAPP");
  if (!resolved || resolved.provider !== "meta") return reply(404);
  if (request.method === "GET") {
    const query = new URL(request.url).searchParams;
    const token = query.get("hub.verify_token");
    const challenge = query.get("hub.challenge");
    if (query.get("hub.mode") !== "subscribe" || !token || !challenge || !safeEqual(token, resolved.config.verifyToken ?? "") || challenge.length > 200) return reply(403);
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain", "cache-control": "no-store" } });
  }
  const body = await readBody(request);
  if (body === null) return reply(413);
  if (!verifyMetaSignature(resolved.config.appSecret ?? "", body, request.headers.get("x-hub-signature-256"))) return reply(401, { error: "Not verified." });
  let payload: MetaPayload;
  try {
    payload = JSON.parse(body);
  } catch {
    return reply(400);
  }
  for (const entry of (payload.entry ?? []).slice(0, 20)) {
    for (const change of (entry.changes ?? []).slice(0, 20)) {
      for (const message of (change.value?.messages ?? []).slice(0, 50)) {
        if (typeof message.from === "string" && typeof message.text?.body === "string" && isStopWord(message.text.body)) await stopByNumber(scopeOrgId, "WHATSAPP", `+${message.from}`);
      }
      for (const status of (change.value?.statuses ?? []).slice(0, 50)) {
        if (typeof status.id === "string" && typeof status.status === "string") await recordDeliveryState(status.id, status.status);
      }
    }
  }
  return reply(200);
}

const empty = () => new Response("<Response/>", { status: 200, headers: { "content-type": "text/xml", "cache-control": "no-store" } });

/** Twilio's inbound and status webhook for WhatsApp and SMS. Verified by X-Twilio-Signature with the account's auth token. */
export async function twilioWebhook(request: Request, scopeOrgId: string | null): Promise<Response> {
  const body = await readBody(request);
  if (body === null) return reply(413);
  const params = new URLSearchParams(body);
  const channel = (params.get("From") ?? params.get("To") ?? "").startsWith("whatsapp:") ? "WHATSAPP" : "SMS";
  const resolved = await channelForScope(scopeOrgId, channel);
  if (!resolved || resolved.provider !== "twilio") return reply(404);
  const url = new URL(request.url);
  // The signature covers the address Twilio called, which behind a proxy is the public one.
  const base = process.env.NEXT_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  const signed = base ? `${base}${url.pathname}${url.search}` : request.url;
  const token = resolved.smsConfig?.twilioAuthToken ?? resolved.config.authToken ?? "";
  if (!verifyTwilioSignature(token, signed, params, request.headers.get("x-twilio-signature"))) return reply(401, { error: "Not verified." });
  const from = (params.get("From") ?? "").replace(/^whatsapp:/, "");
  if (isStopWord(params.get("Body") ?? "")) await stopByNumber(scopeOrgId, channel, from);
  const sid = params.get("MessageSid");
  const state = params.get("MessageStatus");
  if (sid && state) await recordDeliveryState(sid, state.toLowerCase());
  return empty();
}
