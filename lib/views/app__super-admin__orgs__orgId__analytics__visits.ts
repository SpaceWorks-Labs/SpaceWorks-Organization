import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/permissions";
import { loadVisitSummary, recentDays } from "@/lib/visits/read";

const DAYS = 30;

/** One organisation's public-page visits for the platform super admin: counts only. */
export async function loadSuperAdminOrgVisitsView({ params }: { params: Promise<{ orgId: string }> }) {
  await requireSuperAdmin();
  const { orgId } = await params;
  const org = await prisma.organisation.findUnique({ where: { id: orgId }, select: { id: true, slug: true } });
  if (!org) notFound();
  const { firstDay, lastDay } = recentDays(DAYS);
  return { days: DAYS, slug: org.slug, summary: await loadVisitSummary(org.id, firstDay, lastDay) };
}

export type SuperAdminOrgVisitsView = Awaited<ReturnType<typeof loadSuperAdminOrgVisitsView>>;
