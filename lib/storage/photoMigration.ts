import "server-only";

import { prisma } from "@/lib/db";
import { uploadKeyFromUrl } from "@/lib/uploadUrl";
import { getPublicUrl } from "./index";
import { copyStoredObject, deleteFilesWithHistory, memberPhotoKey } from "./memberPhotos";

/*
 * One-off move of member photos from organisations/<org>/member-id-photos/<uuid>.webp to the per-member
 * layout organisations/<org>/members/<member>/photo-<uuid>.webp, a few members per scheduler pass. The new
 * key keeps the old uuid, so a pass cut off half way repeats the same copy; Member.photoUrl changes only
 * while it still points at the old file, and the old object and Asset row go last. Safe to run any number
 * of times: once no photo is left in the old layout it finds nothing. Passes walk the members by id from
 * `after` (the caller keeps the cursor), so a photo that keeps failing is passed over until the next full pass.
 */

const LEGACY = /^organisations\/([A-Za-z0-9_-]{1,128})\/member-id-photos\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.webp$/i;

export async function migrateMemberPhotos(limit = 20, after: string | null = null) {
  const members = await prisma.member.findMany({
    where: { photoUrl: { contains: "/member-id-photos/" }, ...(after ? { id: { gt: after } } : {}) },
    orderBy: { id: "asc" },
    take: limit,
    select: { id: true, organisationId: true, photoUrl: true },
  });
  let moved = 0;
  for (const member of members) {
    try {
      if (await moveOne(member)) moved += 1;
    } catch {
      // Left as it is for the next full pass; the others carry on.
      console.error("[photo move] a member photo couldn't be moved");
    }
  }
  return { checked: members.length, moved, lastId: members.at(-1)?.id ?? null };
}

/** The store has no object at the source key: there is nothing to move. */
function isMissingObject(error: unknown) {
  const name = (error as { name?: unknown } | null)?.name;
  return name === "NoSuchKey" || name === "NotFound";
}

/** Move one member's photo; true when it now sits in the new layout. */
async function moveOne(member: { id: string; organisationId: string; photoUrl: string | null }) {
  const oldUrl = member.photoUrl!;
  const oldKey = uploadKeyFromUrl(oldUrl);
  const match = oldKey ? LEGACY.exec(oldKey) : null;
  const usable = Boolean(match && match[1] === member.organisationId);
  const newKey = usable ? memberPhotoKey(member.organisationId, member.id, match![2]!) : null;
  // A photo whose file is gone (or that isn't this organisation's) can't be drawn anyway: clear it.
  const copied = newKey
    ? await copyStoredObject(oldKey!, newKey, member.organisationId).catch((error: unknown) => {
        if (isMissingObject(error)) return false;
        throw error;
      })
    : false;
  const newUrl = copied ? getPublicUrl(newKey!) : null;
  const { count } = await prisma.member.updateMany({ where: { id: member.id, photoUrl: oldUrl }, data: { photoUrl: newUrl } });
  if (count === 0) {
    // Changed while we copied. Another instance may have moved the same photo to the same key, so the copy goes
    // only if it isn't the member's photo now.
    const current = await prisma.member.findUnique({ where: { id: member.id }, select: { photoUrl: true } });
    if (copied && current?.photoUrl !== newUrl) await deleteFilesWithHistory([newKey!]);
    return false;
  }
  if (usable) await deleteFilesWithHistory([oldKey!]);
  return copied;
}
