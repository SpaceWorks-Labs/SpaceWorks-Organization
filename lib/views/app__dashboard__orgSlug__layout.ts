import { prisma } from "@/lib/db";
import { can, requireOrgTeam } from "@/lib/permissions";
import { CAPABILITY_LIST } from "@/lib/permissionRoles";
import type { ShellOrganisation } from "@/lib/appShell";

export async function loadOrgSlugShell({
  params,
}: {

  params: Promise<{ orgSlug: string; }>;
}) {
  const { orgSlug } = await params;
  // Any status: the application page lives under this layout. Each page applies its own gate.
  const { organisation, membership } = await requireOrgTeam(orgSlug);
  // A super admin in through platform access gets the organisation in the sidebar and a banner on every page.
  let platform: ShellOrganisation | null = null;
  if (membership.superAdmin) {
    const { logoUrl } = await prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id }, select: { logoUrl: true } });
    platform = {
      slug: organisation.slug,
      name: organisation.name,
      logoUrl,
      roleName: "Platform super admin",
      status: organisation.status,
      capabilities: CAPABILITY_LIST.filter((capability) => can(membership, capability)),
    };
  }
  return { organisation, platform };
}
