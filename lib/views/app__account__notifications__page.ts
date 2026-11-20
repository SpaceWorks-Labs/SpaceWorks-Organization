import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";
import { memberOrganisations, offersFor, type ChannelOffer } from "@/lib/notify/account";
import { loadOwnMessages, type OwnMessage } from "@/lib/notify/history";

export type NotificationsOrg = {
  slug: string;
  name: string;
  channels: Array<ChannelOffer & { linked: boolean; consent: boolean }>;
};

/** Account, Notifications: for each organisation the person belongs to, which extra channels it offers, whether each is linked, and the person's choice. */
export async function loadAccountNotificationsView(): Promise<{ organisations: NotificationsOrg[]; messages: OwnMessage[] }> {
  const session = await requireAuth();
  const userId = session.user.id;
  const [orgs, messages] = await Promise.all([memberOrganisations(userId), loadOwnMessages(userId)]);
  const [endpoints, consents] = await Promise.all([
    prisma.notificationEndpoint.findMany({ where: { userId, revokedAt: null }, select: { organisationId: true, channel: true } }),
    prisma.messagingConsent.findMany({ where: { userId, status: "OPTED_IN" }, select: { organisationId: true, channel: true } }),
  ]);
  const organisations = await Promise.all(orgs.map(async (org) => ({
    slug: org.slug,
    name: org.name,
    channels: (await offersFor(org.id)).map((offer) => ({
      ...offer,
      linked: endpoints.some((endpoint) => endpoint.organisationId === offer.scopeOrgId && endpoint.channel === offer.channel),
      consent: consents.some((consent) => consent.organisationId === org.id && consent.channel === offer.channel),
    })),
  })));
  return { organisations, messages };
}
