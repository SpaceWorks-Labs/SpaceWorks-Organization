import { prisma } from "@/lib/db";
import { can, requireOrgTeam } from "@/lib/permissions";
import { canResubmit } from "@/lib/organisationLifecycle";

/** The organisation's application and lifecycle, for its own team, whatever its status. */
export async function loadOrgApplicationView({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organisation, membership } = await requireOrgTeam(orgSlug);
  const [details, reviews] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({
      where: { id: organisation.id },
      select: {
        name: true, slug: true, status: true, kind: true, description: true, contactEmail: true, contactPhone: true,
        website: true, addressLine: true, city: true, stateCode: true, postalCode: true, createdAt: true,
      },
    }),
    prisma.organisationReview.findMany({
      where: { organisationId: organisation.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      // Platform admins are not named to applicants: the history says what happened, not who.
      select: { id: true, action: true, reason: true, createdAt: true },
    }),
  ]);
  const latestNote = reviews.find((review) => review.reason)?.reason ?? null;
  return {
    organisation: details,
    reviews,
    latestNote,
    canEdit: can(membership, "org.settings", { write: true }) && canResubmit(details.status),
    isManager: can(membership, "org.settings"),
  };
}
