import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireOrgTeam } from "@/lib/permissions";
import { openTransferWhere } from "@/lib/team/ownership";

const expiryFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/**
 * The ownership offer for the person it names, whatever their role holds: a proposed owner may lack the overview's
 * org.view. Anyone else on the team, or with no open offer, gets not found.
 */
export async function loadOwnershipOfferView({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organisation, userId } = await requireOrgTeam(orgSlug);
  const [offer, org] = await Promise.all([
    prisma.ownershipTransfer.findFirst({
      where: { ...openTransferWhere(organisation.id), toUserId: userId, expiresAt: { gt: new Date() } },
      select: { token: true, expiresAt: true, fromUser: { select: { name: true } }, keepRole: { select: { name: true } } },
    }),
    prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id }, select: { name: true, slug: true, logoUrl: true } }),
  ]);
  if (!offer) notFound();
  return { organisation: org, offer: { token: offer.token, fromName: offer.fromUser.name ?? "The owner", keepRoleName: offer.keepRole.name, expiresLabel: expiryFormatter.format(offer.expiresAt) } };
}
