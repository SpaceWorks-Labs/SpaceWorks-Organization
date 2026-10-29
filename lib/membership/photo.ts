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
export type PreparedMemberPhoto = { body: Buffer };
type PhotoResult = { url: string | null; kept?: true } | { error: string };

/** The uploaded file, or the message to show when it can't be used. */
export function photoFile(value: FormDataEntryValue | null): File | { error: string } {
  if (!(value instanceof File) || value.size === 0) return { error: "Choose a photo to upload." };
  if (value.size > MAX_IMAGE_BYTES) return { error: "Photos must be 5 MB or smaller." };
  return value;
}

/** Validate and fully decode before any writes; re-encoding strips metadata and produces a 600 x 600 WebP. */
export async function prepareMemberPhoto(file: File): Promise<PreparedMemberPhoto | { error: string }> {
  const checked = photoFile(file);
  if ("error" in checked) return checked;
  return createSafeWebpDerivative(checked, { width: 600, height: 600, fit: "cover" });
}

async function discardPhoto(key: string) {
  await deleteFilesWithHistory([key]).catch(() => console.error("[media] member photo not deleted"));
}

/** Save a file or an already prepared join photo (null removes it). Callers keep their existing audit events. */
export async function replaceMemberPhoto(
  member: Member,
  file: File | PreparedMemberPhoto | null,
  options: { onlyIfEmpty?: boolean } = {},
): Promise<PhotoResult> {
  let url: string | null = null;
  let key: string | null = null;
  if (file) {
    const derivative = file instanceof File ? await prepareMemberPhoto(file) : file;
    if ("error" in derivative) return derivative;
    key = memberPhotoKey(member.organisationId, member.id);
    try {
      await uploadFile({ key, body: derivative.body, contentType: "image/webp", organisationId: member.organisationId });
    } catch {
      console.error("[media] member photo upload failed");
      return { error: "Couldn't upload the photo. Try again." };
    }
    url = getPublicUrl(key);
  }
  let saved: { result: PhotoResult; oldKey?: string | null };
  try {
    saved = await prisma.$transaction(async (tx) => {
      const [current] = await tx.$queryRaw<Array<{ photoUrl: string | null; anonymisedAt: Date | null }>>`
        SELECT "photoUrl", "anonymisedAt" FROM "Member"
        WHERE "id" = ${member.id} AND "organisationId" = ${member.organisationId} FOR UPDATE`;
      if (!current || current.anonymisedAt) return { result: { error: "Member not found." } };
      if (options.onlyIfEmpty && current.photoUrl) return { result: { url: current.photoUrl, kept: true as const } };
      await tx.member.update({ where: { id: member.id, organisationId: member.organisationId }, data: { photoUrl: url } });
      return { result: { url }, oldKey: current.photoUrl ? uploadKeyFromUrl(current.photoUrl) : null };
    });
  } catch (error) {
    if (key) await discardPhoto(key);
    throw error;
  }
  if (key && ("error" in saved.result || saved.result.kept)) await discardPhoto(key);
  if (saved.oldKey) await discardPhoto(saved.oldKey);
  return saved.result;
}
