import "server-only";

import { CopyObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { storageBucket, storageClient, storageConfigured } from "./client";
import { isPublicDerivativeKey } from "./index";
import { purgeObjects } from "./purge";

/*
 * Member photos live per member: organisations/<orgId>/members/<memberId>/photo-<uuid>.webp, in the same
 * bucket as every other upload (Silo on a VPS, Cloudflare R2 or any S3 in the cloud), each with its Asset
 * row. Everything about one member sits under one prefix, so erasure deletes the prefix and nothing of
 * the person is left behind. Photos from before 0.7 sit at organisations/<orgId>/member-id-photos/<uuid>.webp
 * until the scheduler moves them (lib/storage/photoMigration.ts).
 */

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function memberPhotoPrefix(organisationId: string, memberId: string) {
  if (!ID.test(organisationId) || !ID.test(memberId)) throw new Error("Invalid member photo owner.");
  return `organisations/${organisationId}/members/${memberId}/`;
}

/** A new key for this member's photo; `id` keeps a known uuid (the move from the old layout reuses it). */
export function memberPhotoKey(organisationId: string, memberId: string, id: string = crypto.randomUUID()) {
  if (!UUID.test(id)) throw new Error("Invalid member photo id.");
  return `${memberPhotoPrefix(organisationId, memberId)}photo-${id.toLowerCase()}.webp`;
}

/** Copy one stored object to a new key (same bucket), with an Asset row for the copy. */
export async function copyStoredObject(from: string, to: string, organisationId: string) {
  const asset = await prisma.asset.findUnique({ where: { key: from }, select: { provider: true, fileData: true, contentType: true, byteSize: true } });
  if (!asset) return false;
  if (asset.provider === "s3") {
    if (!storageConfigured()) throw new Error("Private object storage is not configured.");
    const bucket = storageBucket();
    await storageClient().send(new CopyObjectCommand({ Bucket: bucket, Key: to, CopySource: `${bucket}/${from}`, MetadataDirective: "COPY" }));
  } else if (!asset.fileData) return false;
  const data = { contentType: asset.contentType, byteSize: asset.byteSize, provider: asset.provider, fileData: asset.provider === "s3" ? null : asset.fileData, organisationId };
  await prisma.asset.upsert({ where: { key: to }, create: { key: to, ...data }, update: data });
  return true;
}

/** Delete every stored object under the member's prefix, every version of it, and the Asset rows. */
export async function deleteMemberPhotos(organisationId: string, memberId: string) {
  const prefix = memberPhotoPrefix(organisationId, memberId);
  const keys = new Set((await prisma.asset.findMany({ where: { key: { startsWith: prefix } }, select: { key: true } })).map((row) => row.key));
  if (storageConfigured()) for (const key of await purgeObjects({ prefix })) keys.add(key);
  await prisma.asset.deleteMany({ where: { key: { startsWith: prefix } } });
  return keys.size;
}

/** Like `deleteFiles`, but every stored version goes too: for personal data (photos replaced, moved or erased). */
export async function deleteFilesWithHistory(keys: string[]) {
  const valid = [...new Set(keys.filter(isPublicDerivativeKey))];
  if (valid.length === 0) return;
  const stored = await prisma.asset.findMany({ where: { key: { in: valid }, provider: "s3" }, select: { key: true } });
  if (stored.length > 0) {
    if (!storageConfigured()) throw new Error("Private object storage is not configured.");
    await purgeObjects({ keys: stored.map((row) => row.key) });
  }
  await prisma.asset.deleteMany({ where: { key: { in: valid } } });
}

/** The outbox job an approved erasure queues in its own transaction: the member's prefix and these keys go. */
export type PhotoPurgePayload = { organisationId: string; memberId: string; keys: string[] };

export function asPhotoPurgePayload(value: unknown): PhotoPurgePayload | null {
  const p = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  if (!p || typeof p.organisationId !== "string" || !ID.test(p.organisationId) || typeof p.memberId !== "string" || !ID.test(p.memberId)) return null;
  if (!Array.isArray(p.keys) || p.keys.length > 20 || !p.keys.every((key) => typeof key === "string" && key.length > 0 && key.length <= 1024)) return null;
  return { organisationId: p.organisationId, memberId: p.memberId, keys: p.keys as string[] };
}

/** Run the purge; a storage failure throws, so the outbox tries again later. */
export async function purgeErasedMemberPhotos(payload: PhotoPurgePayload) {
  await deleteMemberPhotos(payload.organisationId, payload.memberId);
  await deleteFilesWithHistory(payload.keys);
}
