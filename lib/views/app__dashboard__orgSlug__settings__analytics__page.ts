import { prisma } from "@/lib/db";
import { requireOrgCapability } from "@/lib/permissions";
import { allowedTelemetryOrigins } from "@/lib/telemetry/env";
import { parseOrgTelemetry } from "@/lib/telemetry/organisation";

/**
 * The organisation's own web analytics settings: the saved public ids and the origins the operator approved.
 * Owner only ("org.delete"); a super admin with platform access acts as the Owner.
 */
export async function loadOrgWebAnalyticsSettingsView({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organisation } = await requireOrgCapability(orgSlug, "org.delete");
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id }, select: { name: true, slug: true, logoUrl: true, webTelemetry: true } });
  const { webTelemetry, ...rest } = org;
  return { org: rest, initial: parseOrgTelemetry(webTelemetry).config, allowedOrigins: allowedTelemetryOrigins() };
}
