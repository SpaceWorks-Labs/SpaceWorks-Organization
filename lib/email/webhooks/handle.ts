import "server-only";

import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getEmailSettings } from "@/lib/instanceSettings";
import { orgProviderConfig } from "../orgTransport";
import { WEBHOOK_PROVIDERS, type WebhookProvider } from "../providerList";
import type { ProviderConfig } from "../providerConfig";
import { recordSuppressions, type SuppressionEntry } from "../suppression";
import { postmarkEntries, resendEntries, sesEntries } from "./events";
import { isSnsUrl, verifyBasicAuth, verifySns, verifySvix, type SnsMessage } from "./verify";

const MAX_BODY = 256 * 1024;
const reply = (status: number, body: Record<string, unknown> = {}) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

async function configFor(organisationId: string | null): Promise<ProviderConfig | null> {
  if (!organisationId) return (await getEmailSettings()).providerConfig ?? {};
  const settings = await prisma.orgEmailSettings.findUnique({ where: { organisationId } });
  return settings ? orgProviderConfig(settings, organisationId) : null;
}

async function confirmSubscription(message: SnsMessage) {
  // Only after the signature and the pinned topic have been verified, and only to an Amazon SNS address.
  if (!message.SubscribeURL || !isSnsUrl(message.SubscribeURL)) return;
  await fetch(message.SubscribeURL, { redirect: "error", signal: AbortSignal.timeout(10_000), cache: "no-store" }).catch(() => undefined);
}

/**
 * Receive a bounce or complaint report from an email provider (product rules §16). Nothing is read from the body
 * until the request is verified: Resend by its Svix signature, Postmark by basic auth with the saved secret, SES
 * by the Amazon SNS signature from the pinned topic. Reports feed the one suppression list that sends skip.
 * `?org=<id>` addresses an organisation's own provider; without it the platform's.
 */
export async function handleEmailWebhook(providerName: string, request: Request): Promise<Response> {
  if (!(WEBHOOK_PROVIDERS as readonly string[]).includes(providerName)) return reply(404);
  const provider = providerName as WebhookProvider;
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return reply(413);
  const body = await request.text();
  if (body.length > MAX_BODY) return reply(413);
  const org = new URL(request.url).searchParams.get("org");
  if (org !== null && !/^[A-Za-z0-9_-]{8,64}$/.test(org)) return reply(404);
  const config = await configFor(org);
  if (!config) return reply(401, { error: "Not verified." });

  let entries: SuppressionEntry[] = [];
  if (provider === "resend") {
    const verified = verifySvix(config.webhookSecret ?? "", { id: request.headers.get("svix-id"), timestamp: request.headers.get("svix-timestamp"), signature: request.headers.get("svix-signature") }, body);
    if (!verified) return reply(401, { error: "Not verified." });
    entries = parse(body, resendEntries);
  } else if (provider === "postmark") {
    if (!verifyBasicAuth(config.webhookSecret ?? "", request.headers.get("authorization"))) return reply(401, { error: "Not verified." });
    entries = parse(body, postmarkEntries);
  } else {
    let message: SnsMessage;
    try {
      message = JSON.parse(body) as SnsMessage;
    } catch {
      return reply(400, { error: "Not a notification." });
    }
    if (!(await verifySns(message, { topicArn: config.sesTopicArn ?? "" }))) return reply(401, { error: "Not verified." });
    if (message.Type === "SubscriptionConfirmation") await confirmSubscription(message);
    if (message.Type === "Notification") entries = sesEntries(message.Message);
  }

  const added = await recordSuppressions(entries, { organisationId: org, provider });
  if (added > 0) await recordAuditEvent({ action: "EMAIL_SUPPRESSIONS_ADDED", organisationId: org, targetType: "EmailSuppression", metadata: { provider, added } });
  return reply(200, { ok: true });
}

function parse(body: string, read: (json: Record<string, unknown>) => SuppressionEntry[]) {
  try {
    const json = JSON.parse(body) as unknown;
    return json && typeof json === "object" ? read(json as Record<string, unknown>) : [];
  } catch {
    return [];
  }
}
