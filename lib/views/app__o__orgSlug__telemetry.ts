import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { configuredProviders, type ConfiguredProvider } from "@/lib/telemetry/configured";
import { orgScopeId, parseOrgTelemetry } from "@/lib/telemetry/organisation";
import type { TelemetryView } from "@/lib/telemetry/types";

type Props = { params: Promise<{ orgSlug: string }> };

/** Only an active organisation's public pages run its providers; anything else resolves to nothing, never a 404. */
async function activeOrganisationTelemetry(slug: string) {
  const org = await prisma.organisation.findUnique({ where: { slug }, select: { id: true, status: true, webTelemetry: true } });
  if (!org || org.status !== "ACTIVE") return null;
  return { id: org.id, ...parseOrgTelemetry(org.webTelemetry) };
}

/**
 * The organisation's own public telemetry configuration for its /o/<slug> layout. Only a visitor with no session
 * gets it, so a signed-in page never receives provider settings. Public ids only; consent is scoped "org:<id>".
 */
export async function loadOrgWebTelemetryView({ params }: Props): Promise<TelemetryView | null> {
  const session = await auth();
  if (session?.user) return null;
  const { orgSlug } = await params;
  const found = await activeOrganisationTelemetry(orgSlug);
  return found?.configured ? { scopeId: orgScopeId(found.id), config: found.config, mixpanel: null } : null;
}

/** Provider names and purposes for the organisation's privacy note. Public, and no ids. */
export async function loadOrgPrivacyNoteView({ params }: Props): Promise<{ providers: ConfiguredProvider[] }> {
  const { orgSlug } = await params;
  const found = await activeOrganisationTelemetry(orgSlug);
  return { providers: found ? configuredProviders(found.config, null) : [] };
}
