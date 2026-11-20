import "server-only";

import { invalidateOrg } from "@/lib/cache";

/**
 * Call after a membership, payment or erasure change has committed (never inside its transaction): drops the cached
 * public page figures and analytics of the organisation, so counts and plans' numbers are fresh. Never throws.
 */
export function membershipChanged(organisationId: string): Promise<void> {
  return invalidateOrg(organisationId, "public-page", "analytics");
}
