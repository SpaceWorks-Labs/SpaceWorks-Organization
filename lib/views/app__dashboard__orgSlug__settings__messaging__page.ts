import { prisma } from "@/lib/db";
import { can, requireOrgCapability } from "@/lib/permissions";
import { isSmsConfigured } from "@/lib/sms/settings";
import { formatClock } from "@/lib/notify/quiet";
import { loadOrgMessaging } from "@/lib/notify/settings";
import { platformMayBeUsed, resolveChannel } from "@/lib/notify/store";
import { channelViews, whatsappTemplateRows } from "@/lib/notify/viewData";
import { paymentSecretsConfigured } from "@/lib/payments/secrets";
import { CONFIGURABLE_CHANNELS } from "@/lib/messages/kinds";

/**
 * Settings, Messaging: the channels members can be reached on (the organisation's own connections, or the platform's),
 * the route each message takes, quiet hours and the approved WhatsApp templates. No secret is selected.
 */
export async function loadOrgMessagingView({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organisation, membership } = await requireOrgCapability(orgSlug, "org.settings");
  const [org, settings, channels, templates, platformOk, smsReady] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id }, select: { name: true, slug: true, logoUrl: true, timezone: true } }),
    loadOrgMessaging(prisma, organisation.id),
    channelViews(organisation.id),
    whatsappTemplateRows(organisation.id),
    platformMayBeUsed(),
    isSmsConfigured(),
  ]);
  // Where each channel would come from right now: the organisation's own, the platform's, or nowhere.
  const sources = await Promise.all(CONFIGURABLE_CHANNELS.map(async (channel) => [channel, (await resolveChannel(prisma, organisation.id, channel))?.scope ?? null] as const));
  return {
    org,
    canEdit: can(membership, "org.settings", { write: true }),
    canConnect: can(membership, "org.delete", { write: true }),
    secretsReady: paymentSecretsConfigured(),
    platformOk,
    smsReady,
    sources: Object.fromEntries(sources) as Record<(typeof CONFIGURABLE_CHANNELS)[number], "org" | "platform" | null>,
    channels,
    templates,
    routing: settings.routing,
    quietStart: settings.quietStart === null ? "" : formatClock(settings.quietStart),
    quietEnd: settings.quietEnd === null ? "" : formatClock(settings.quietEnd),
  };
}
