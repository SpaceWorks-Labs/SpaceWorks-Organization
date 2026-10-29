import "server-only";

import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { uploadKeyFromUrl } from "@/lib/uploadUrl";
import { storageBucket, storageClient, storageConfigured } from "./client";
import { purgeObjects } from "./purge";

const DAY_MS = 24 * 60 * 60_000;
const MEMBER_OBJECT = /^organisations\/([A-Za-z0-9_-]{1,64})\/members\/([A-Za-z0-9_-]{1,64})\/.+$/;
const STATE = Symbol.for("swo.memberPhotoSweep");
type StateHolder = typeof globalThis & { [STATE]?: { lastRun?: number; token?: string } };

/**
 * Walk a bounded number of object pages per run, resuming on the next run until the pass is complete; a new pass
 * starts a day after the last one finished. Only member prefixes qualify;
 * live members' unattached uploads get 24 hours to finish. Erased and missing members retain nothing.
 * The transaction-scoped advisory lock stays on one connection for the whole pass, as in storage cleanup.
 */
export async function runMemberPhotoSweep(now = new Date(), force = false, pageBudget = 10) {
  if (!storageConfigured()) return false;
  const state = ((globalThis as StateHolder)[STATE] ??= {});
  if (!force && !state.token && state.lastRun !== undefined && now.getTime() - state.lastRun < DAY_MS) return false;
  const result = await prisma.$transaction(async (tx) => {
    const [lock] = await tx.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_xact_lock(hashtext(${"swo:member-photo-sweep"})) AS "locked"`;
    if (!lock?.locked) return null;
    let token = state.token;
    for (let pageNumber = 0; pageNumber < pageBudget; pageNumber += 1) {
      const page = await storageClient().send(new ListObjectsV2Command({
        Bucket: storageBucket(), Prefix: "organisations/", ContinuationToken: token, MaxKeys: 100,
      }));
      const objects = (page.Contents ?? []).flatMap((object) => {
        const match = object.Key ? MEMBER_OBJECT.exec(object.Key) : null;
        return match ? [{ key: object.Key!, modified: object.LastModified, organisationId: match[1]!, id: match[2]! }] : [];
      });
      if (objects.length > 0) {
        const members = await tx.member.findMany({
          where: { OR: objects.map(({ id, organisationId }) => ({ id, organisationId })) },
          select: { id: true, organisationId: true, photoUrl: true, anonymisedAt: true },
        });
        const byOwner = new Map(members.map((member) => [`${member.organisationId}/${member.id}`, member]));
        const keys = objects.filter((object) => {
          const member = byOwner.get(`${object.organisationId}/${object.id}`);
          if (!member || member.anonymisedAt) return true;
          const current = member.photoUrl ? uploadKeyFromUrl(member.photoUrl) : null;
          return object.key !== current && object.modified !== undefined && object.modified.getTime() < now.getTime() - DAY_MS;
        }).map((object) => object.key);
        if (keys.length > 0) {
          // Purge by exact keys even without Asset rows (a crash may have interrupted uploadFile).
          await purgeObjects({ keys });
          await tx.asset.deleteMany({ where: { key: { in: keys } } });
        }
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
      if (!token) break;
    }
    return { token };
  }, { timeout: 10 * 60_000, maxWait: 10_000 });
  if (!result) return false;
  state.token = result.token;
  // A pass still under way resumes on the next run; a finished one waits a day.
  if (!result.token) state.lastRun = now.getTime();
  return true;
}
