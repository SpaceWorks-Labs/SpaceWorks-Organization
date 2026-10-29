import "server-only";

import { prisma } from "@/lib/db";
import { storageConfigured } from "./client";
import { purgeObjects } from "./purge";

/*
 * Private generated files: bulk card exports stored before cards became fully on demand (0.7). Keys are
 * organisations/<id>/exports/<uuid>.<pdf|zip>, in the same bucket as everything else (Silo, R2 or any S3),
 * or in the Asset table without object storage (development only). Nothing writes them any more; the
 * scheduler deletes the ones left (lib/storage/cleanup.ts).
 */

const PRIVATE_KEY = /^organisations\/([A-Za-z0-9_-]{1,128})\/exports\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|zip)$/;

function isPrivateExportKey(key: string) {
  return PRIVATE_KEY.test(key);
}

export async function deletePrivateExports(keys: string[]) {
  const valid = [...new Set(keys.filter(isPrivateExportKey))];
  if (valid.length === 0) return;
  const stored = await prisma.asset.findMany({ where: { key: { in: valid }, provider: "s3" }, select: { key: true } });
  if (stored.length > 0) {
    if (!storageConfigured()) throw new Error("Private object storage is not configured.");
    // Every version: an export held members' details.
    await purgeObjects({ keys: stored.map(({ key }) => key) });
  }
  await prisma.asset.deleteMany({ where: { key: { in: valid } } });
}
