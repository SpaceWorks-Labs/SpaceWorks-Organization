import "server-only";

import { prisma } from "@/lib/db";
import { getSmsSettings } from "../settings";
import { verifyTwilioSignature, verifyUrlToken } from "./verify";

const MAX_BODY = 64 * 1024;
const reply = (status: number, body: Record<string, unknown> = {}) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** How far along a delivery state is; a late "sent" never overwrites "delivered". */
const RANK: Record<string, number> = { queued: 0, accepted: 0, sending: 1, sent: 1, delivered: 2, undelivered: 2, failed: 2 };

async function record(providerRef: string, state: string, error: string | null) {
  if (!providerRef || providerRef.length > 80 || !(state in RANK)) return;
  const row = await prisma.smsCode.findFirst({ where: { providerRef }, select: { id: true, deliveryState: true } });
  if (!row || RANK[state] < (RANK[row.deliveryState ?? "queued"] ?? 0)) return;
  await prisma.smsCode.update({ where: { id: row.id }, data: { deliveryState: state, deliveryError: error?.slice(0, 20) ?? null } });
}

/** MSG91 reports 1 for delivered and other numbers for the different ways a message fails. */
function msg91State(status: unknown) {
  const value = String(status ?? "").toLowerCase();
  if (value === "1" || value === "delivered" || value === "delivrd") return "delivered";
  if (value === "" || value === "0" || value === "sent" || value === "submitted") return value === "" ? null : "sent";
  return "failed";
}

/**
 * Receive a delivery report from an SMS provider (product rules section 16). Nothing is read until the request is
 * verified: Twilio by X-Twilio-Signature with the saved auth token, MSG91 by the secret token in its address. The
 * state lands on the code's send record only; no number or message text is stored or audited.
 */
export async function handleSmsWebhook(providerName: string, request: Request): Promise<Response> {
  if (providerName !== "twilio" && providerName !== "msg91") return reply(404);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return reply(413);
  const body = await request.text();
  if (body.length > MAX_BODY) return reply(413);
  const { config } = await getSmsSettings();
  const url = new URL(request.url);

  if (providerName === "twilio") {
    // The signature covers the address Twilio called, which behind a proxy is the public one.
    const base = process.env.NEXT_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
    const signed = base ? `${base}${url.pathname}${url.search}` : request.url;
    const params = new URLSearchParams(body);
    if (!verifyTwilioSignature(config.twilioAuthToken ?? "", signed, params, request.headers.get("x-twilio-signature"))) return reply(401, { error: "Not verified." });
    await record(params.get("MessageSid") ?? "", (params.get("MessageStatus") ?? "").toLowerCase(), params.get("ErrorCode"));
    return reply(200, { ok: true });
  }

  if (!verifyUrlToken(config.webhookSecret ?? "", url.searchParams.get("token"))) return reply(401, { error: "Not verified." });
  let reports: unknown;
  try {
    reports = JSON.parse(body);
  } catch {
    return reply(400, { error: "Not a report." });
  }
  for (const item of (Array.isArray(reports) ? reports : [reports]).slice(0, 100)) {
    if (!item || typeof item !== "object") continue;
    const report = item as Record<string, unknown>;
    const state = msg91State(report.status);
    if (state) await record(String(report.requestId ?? report.request_id ?? ""), state, state === "failed" ? String(report.status ?? "") : null);
  }
  return reply(200, { ok: true });
}
