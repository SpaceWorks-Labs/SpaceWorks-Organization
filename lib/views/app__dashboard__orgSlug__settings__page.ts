import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { can, requireOrgCapability } from "@/lib/permissions";
type Props = { params: Promise<{ orgSlug: string; }>; };

export async function loadOrgSettingsView({ params }: Props) {

  const { orgSlug } = await params;
  const { organisation, membership } = await requireOrgCapability(orgSlug, "org.settings");

  const org = await prisma.organisation.findUnique({
    where: { id: organisation.id },
    select: { name: true, description: true, logoUrl: true, slug: true, memberPortal: true, memberPhotoUpload: true },
  });

  if (!org) notFound();

  const canEdit = can(membership, "org.settings", { write: true });
  return { org, organisation, canDelete: can(membership, "org.delete"), canEditProfile: canEdit, canEditPortal: canEdit };
}
