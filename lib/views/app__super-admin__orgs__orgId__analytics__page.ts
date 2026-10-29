import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { recordThrottledAuditEvent } from "@/lib/audit";
import { ANALYTICS_TTL_SECONDS, analyticsCacheKey, cached } from "@/lib/cache";
import { loadOrgAnalytics } from "@/lib/reports/platformOrgAnalytics";

type Props = { params: Promise<{ orgId: string }> };

/**
 * H7 one organisation's analytics for the platform super admin. Aggregates only, never a member's name,
 * email or phone (owner decision 3). Each view is audited, at most once per half hour per organisation, like
 * opening the organisation's page.
 */
export async function loadSuperAdminOrgAnalyticsView({ params }: Props) {
  const session = await requireSuperAdmin();
  const { orgId } = await params;
  const exists = await prisma.organisation.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!exists) notFound();
  await recordThrottledAuditEvent({ action: "SUPER_ADMIN_ORG_ANALYTICS_VIEWED", actorUserId: session.user.id, organisationId: exists.id, targetType: "Organisation", targetId: exists.id, windowMs: 30 * 60_000 }).catch(() => undefined);
  const now = new Date();
  // Organisation-wide aggregates, cached under the organisation and dropped when its rollup is rewritten.
  const analytics = await cached(analyticsCacheKey(exists.id, null, "platform"), ANALYTICS_TTL_SECONDS, () => loadOrgAnalytics(exists.id, now));
  if (!analytics) notFound();
  return { ...analytics, now };
}

export type SuperAdminOrgAnalyticsView = Awaited<ReturnType<typeof loadSuperAdminOrgAnalyticsView>>;
