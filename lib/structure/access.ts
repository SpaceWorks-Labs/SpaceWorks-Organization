import "server-only";

import type { Prisma } from "@prisma/client";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { invalidateOrg } from "@/lib/cache";
import { orgActionAccess } from "@/lib/permissions";
import type { Capability } from "@/lib/permissionRoles";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

/**
 * Who may change the organisation's structure (`structure.manage`) or its preferences (`org.settings`). Both are
 * org-wide to change, so `orgActionAccess` refuses staff limited to one unit.
 */
export async function structureAccess(slug: unknown, capability: Capability = "structure.manage") {
  const access = await orgActionAccess(slug, capability);
  if (!access.ok) return access;
  if (await isActionRateLimited("action", access.userId)) return { ok: false as const, error: "Too many requests. Try again shortly." };
  return access;
}

export async function refreshStructure(organisation: { id: string; slug: string }) {
  revalidatePath(`/dashboard/${organisation.slug}/settings`, "layout");
  revalidatePath(`/dashboard/${organisation.slug}/members`);
  // The public page lists units and the analytics name them.
  await invalidateOrg(organisation.id, "public-page", "analytics");
}

/**
 * Serialise structure changes in one organisation: unit paths are derived from their parents', so a create, move,
 * archive or level change must never run alongside another.
 */
export async function lockOrganisationStructure(tx: Prisma.TransactionClient, organisationId: string) {
  // NO KEY UPDATE serialises structure edits without blocking inserts that reference the organisation.
  await tx.$queryRaw`SELECT 1 FROM "Organisation" WHERE "id" = ${organisationId} FOR NO KEY UPDATE`;
}
