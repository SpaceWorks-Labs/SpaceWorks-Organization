"use server";

import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { orgActionAccess } from "@/lib/permissions";
import { teamScope, unitInScope } from "@/lib/membership/scope";
import { photoFile, replaceMemberPhoto } from "@/lib/membership/photo";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

/**
 * A manager sets or removes the photo printed on a member's card. The image is re-encoded as a square
 * WebP; the previous upload is deleted once the new one is saved. Without one, cards use the member's
 * own account picture.
 */
export async function setMemberPhoto(formData: FormData): Promise<ActionResult<{ url: string | null }>> {
  const slug = String(formData.get("organisationSlug") ?? "").trim();
  const memberId = String(formData.get("memberId") ?? "").trim().slice(0, 64);
  const remove = formData.get("remove") === "1";
  const access = await orgActionAccess(slug, "members.manage");
  if (!access.ok) return access;
  if (await isActionRateLimited("upload", access.userId)) return { ok: false, error: "Too many uploads. Try again later." };
  const scope = await teamScope(access.organisation.id, access.membership.unitId);
  const member = await prisma.member.findFirst({ where: { id: memberId, organisationId: access.organisation.id, anonymisedAt: null }, select: { id: true, organisationId: true, photoUrl: true, unit: { select: { path: true } } } });
  if (!member || !unitInScope(scope, member.unit?.path ?? null)) return { ok: false, error: "Member not found." };

  const file = remove ? null : photoFile(formData.get("file"));
  if (file && "error" in file) return { ok: false, error: file.error };
  const saved = await replaceMemberPhoto(member, file);
  if ("error" in saved) return { ok: false, error: saved.error };
  await recordAuditEvent({ action: remove ? "MEMBER_PHOTO_REMOVED" : "MEMBER_PHOTO_UPLOADED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "Member", targetId: member.id });
  revalidatePath(`/dashboard/${access.organisation.slug}/members/${member.id}`);
  return { ok: true, data: { url: saved.url } };
}
