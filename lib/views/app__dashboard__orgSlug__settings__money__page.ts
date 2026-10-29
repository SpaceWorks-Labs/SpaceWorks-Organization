import { prisma } from "@/lib/db";
import { can, requireOrgCapability } from "@/lib/permissions";

/** Money and calendar preferences, and whether the calendar is already fixed by existing memberships. */
export async function loadOrgMoneySettingsView({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organisation, membership } = await requireOrgCapability(orgSlug, "org.settings");
  const org = await prisma.organisation.findUniqueOrThrow({
    where: { id: organisation.id },
    select: { name: true, slug: true, logoUrl: true, currency: true, locale: true, timezone: true, financialYearStartMonth: true, offlineConfirmationRequired: true, _count: { select: { terms: true } } },
  });
  const zones = Intl.supportedValuesOf("timeZone");
  return {
    org,
    canEdit: can(membership, "org.settings", { write: true }),
    calendarLocked: org._count.terms > 0,
    timezones: zones.includes(org.timezone) ? zones : [org.timezone, ...zones],
  };
}
