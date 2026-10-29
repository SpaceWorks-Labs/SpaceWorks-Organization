"use server";

import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { updateOrganisationSchema } from "@/lib/validators";
import { flattenZodErrors } from "./utils";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { isOrganisationUploadUrl } from "@/lib/uploadUrl";
import { orgActionAccess } from "@/lib/permissions";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

export type ActionResult<T = void> =
  | { ok: true; data?: T; }
  | {
    ok: false;
    error: string;
    fieldErrors?: Record<string, string[]>;
    /** The action needs an explicit confirmation to go ahead (for example, overriding a warning). */
    needsForce?: boolean;
  };

export async function updateOrganisation(
  input: unknown,
): Promise<ActionResult> {
  const parsed = updateOrganisationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const { organisationSlug, name, description, logoUrl } = parsed.data;
  // `org.settings` is org-wide to change: staff limited to one unit can't rename the organisation.
  const access = await orgActionAccess(organisationSlug, "org.settings");
  if (!access.ok) return access;
  if (await isActionRateLimited("action", access.userId)) {
    return { ok: false, error: "Too many requests. Try again shortly." };
  }
  const org = access.organisation;
  if (
    logoUrl &&
    !isOrganisationUploadUrl(logoUrl, org.id, "organisation-logos")
  ) {
    return { ok: false, error: "Choose an uploaded organisation logo." };
  }

  try {
    await prisma.organisation.update({
      where: { id: org.id },
      data: {
        name,
        description: description ?? "",
        logoUrl: logoUrl || null,
      },
    });
    await recordAuditEvent({
      action: "ORGANISATION_UPDATED",
      actorUserId: access.userId,
      organisationId: org.id,
      targetType: "Organisation",
      targetId: org.id,
    });
    revalidatePath(`/dashboard/${org.slug}`);
    revalidatePath(`/dashboard/${org.slug}/team`);
    revalidatePath(`/${org.slug}`);
    return { ok: true };
  } catch {
    console.error("[organisation] update failed");
    return { ok: false, error: "Could not update organisation." };
  }
}
