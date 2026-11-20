import { requireOrgTeam } from "@/lib/permissions";
import { can } from "@/lib/permissionRoles";

/** Which settings tabs the signed-in staff member may open: owner-only sections show only for the Owner. */
export async function loadSettingsTabsView(orgSlug: string): Promise<{ ownerTabs: boolean }> {
  const { membership } = await requireOrgTeam(orgSlug);
  return { ownerTabs: can(membership, "org.delete") };
}
