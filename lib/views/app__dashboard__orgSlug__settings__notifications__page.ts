import { prisma } from "@/lib/db";
import { can, requireOrgCapability } from "@/lib/permissions";
import { paymentSecretsConfigured } from "@/lib/payments/secrets";

/** The organisation's chat channels: where each posts (never its secret) and how its last delivery went. */
export async function loadOrgNotificationsView({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organisation, membership } = await requireOrgCapability(orgSlug, "org.settings");
  const [org, channels] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id }, select: { name: true, slug: true, logoUrl: true, timezone: true } }),
    prisma.chatChannel.findMany({
      where: { organisationId: organisation.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, kind: true, name: true, target: true, events: true, includeNames: true, enabled: true, lastDeliveredAt: true, lastError: true },
    }),
  ]);
  return { org, canEdit: can(membership, "org.settings", { write: true }), secretsReady: paymentSecretsConfigured(), channels };
}
