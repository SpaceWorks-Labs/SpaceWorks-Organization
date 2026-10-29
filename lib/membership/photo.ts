import "server-only";

import { prisma } from "@/lib/db";
import { createSafeWebpDerivative } from "@/lib/imageValidation";
import { getPublicUrl, uploadFile } from "@/lib/storage";
import { deleteFilesWithHistory, memberPhotoKey } from "@/lib/storage/memberPhotos";
import { uploadKeyFromUrl } from "@/lib/uploadUrl";

/*
 * The photo printed on a member's card, from a manager (app/actions/member-photo.ts) or the member themself
 * (app/actions/portal-photo.ts). Callers check who may change it; this validates and re-encodes the image
 * as a 600 x 600 WebP, stores it under the member's own prefix and deletes the previous photo.
 */

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type Member = { id: string; organisationId: string; photoUrl: string | null };

/** The uploaded file, or the message to show when it can't be used. */
export function photoFile(value: FormDataEntryValue | null): File | { error: string } {
  if (!(value instanceof File) || value.size === 0) return { error: "Choose a photo to upload." };
  if (value.size > MAX_IMAGE_BYTES) return { error: "Photos must be 5 MB or smaller." };
  return value;
}

/** Save `file` as the member's photo (null removes it). Returns the new URL, or an error to show. */
export async function replaceMemberPhoto(member: Member, file: File | null): Promise<{ url: string | null } | { error: string }> {
  let url: string | null = null;
  if (file) {
    const derivative = await createSafeWebpDerivative(file, { width: 600, height: 600, fit: "cover" });
    if ("error" in derivative) return { error: String(derivative.error) };
    const key = memberPhotoKey(member.organisationId, member.id);
    try {
      await uploadFile({ key, body: derivative.body, contentType: "image/webp", organisationId: member.organisationId });
    } catch {
      console.error("[media] member photo upload failed");
      return { error: "Couldn't upload the photo. Try again." };
    }
    url = getPublicUrl(key);
  }
  await prisma.member.update({ where: { id: member.id, organisationId: member.organisationId }, data: { photoUrl: url } });
  const oldKey = member.photoUrl ? uploadKeyFromUrl(member.photoUrl) : null;
  if (oldKey) await deleteFilesWithHistory([oldKey]).catch(() => console.error("[media] old member photo not deleted"));
  return { url };
}
