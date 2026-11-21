import "server-only";

import { can, organisationAllows, requireOrgCapability, requireOrgTeam } from "@/lib/permissions";

/**
 * Team access to a certificates page. `issue` and `design` need that one permission; `view` (the list and a
 * certificate's page) opens for either. A role with neither is sent where requireOrgCapability sends anyone
 * without the permission.
 */
export async function requireCertificatesAccess(orgSlug: string, wanted: "view" | "issue" | "design") {
  if (wanted === "issue") return requireOrgCapability(orgSlug, "certificates.issue");
  if (wanted === "design") return requireOrgCapability(orgSlug, "certificates.design");
  const team = await requireOrgTeam(orgSlug);
  const may = (capability: "certificates.issue" | "certificates.design") => organisationAllows(team.organisation.status, capability) && can(team.membership, capability);
  if (may("certificates.issue") || may("certificates.design")) return team;
  return requireOrgCapability(orgSlug, "certificates.issue");
}
