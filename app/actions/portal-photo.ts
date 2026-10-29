"use server";

import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { auth } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { findOwnMember } from "@/lib/portal/member";
import { photoFile, replaceMemberPhoto } from "@/lib/membership/photo";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

/**
 * A member uploads or replaces the photo printed on their own card, when their organisation allows it
 * (Settings, Member accounts). The record is found only through the account's verified email, never by id;
 * the image goes through the same checks and re-encoding as a manager's upload.
 */
export async function setOwnMemberPhoto(formData: FormData): Promise<ActionResult<{ url: string | null }>> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Sign in to continue." };
  if (await isActionRateLimited("upload", userId)) return { ok: false, error: "Too many uploads. Try again later." };
  const member = await findOwnMember(userId, String(formData.get("organisationSlug") ?? "").trim().slice(0, 64));
  if (!member) return { ok: false, error: "We couldn't find that membership on your account." };
  if (!member.organisation.memberPhotoUpload || member.organisation.status !== "ACTIVE") return { ok: false, error: `${member.organisation.name} adds member photos itself. Ask them to change yours.` };

  const file = photoFile(formData.get("file"));
  if ("error" in file) return { ok: false, error: file.error };
  const saved = await replaceMemberPhoto(member, file);
  if ("error" in saved) return { ok: false, error: saved.error };
  await recordAuditEvent({ action: "MEMBER_PHOTO_UPLOADED", actorUserId: userId, organisationId: member.organisationId, targetType: "Member", targetId: member.id, metadata: { by: "member" } });
  revalidatePath(`/account/memberships/${member.organisation.slug}`);
  revalidatePath(`/dashboard/${member.organisation.slug}/members/${member.id}`);
  return { ok: true, data: { url: saved.url } };
}
