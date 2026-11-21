import { prisma } from "@/lib/db";
import { requireOrgCapability } from "@/lib/permissions";
import { memberWhere, teamScope } from "@/lib/membership/scope";

/**
 * The member the issue page starts with when opened from a member's page (`?member=<id>`): their name and unit,
 * only when they are inside the issuer's reach and not erased; anything else is null (the page starts empty).
 */
export async function loadIssueRecipient({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ member?: string }> }) {
  const { orgSlug } = await params;
  const { member: memberId } = await searchParams;
  if (!memberId || memberId.length > 64) return null;
  const { organisation, membership } = await requireOrgCapability(orgSlug, "certificates.issue");
  const scope = await teamScope(organisation.id, membership);
  const member = await prisma.member.findFirst({
    where: { AND: [memberWhere(scope), { id: memberId, anonymisedAt: null }] },
    select: { id: true, name: true, unit: { select: { name: true } } },
  });
  return member ? { id: member.id, name: member.name, unitName: member.unit?.name ?? null } : null;
}
