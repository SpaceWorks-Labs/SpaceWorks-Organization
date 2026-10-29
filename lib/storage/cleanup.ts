import "server-only";

import { prisma } from "@/lib/db";
import { deletePrivateExports } from "./private";
import { migrateMemberPhotos } from "./photoMigration";

/*
 * One-off storage clean-ups for 0.7, run from the scheduler pass (lib/outboxWorker.ts) in small chunks:
 * - Bulk card exports are no longer stored (cards are drawn on demand, bulk downloads stream from
 *   /api/exports/cards/<org>). Files left from earlier releases are deleted and their CardExportJob rows
 *   marked; the table is dropped in a later release.
 * - Member photos move to the per-member layout (lib/storage/photoMigration.ts).
 * Each part stops checking for the rest of the process's life once it finds nothing left to do. Only one
 * scheduler instance runs a pass at a time (a transaction-scoped advisory lock: a session lock taken through
 * Prisma's pool could be released on another connection, or leak behind a transaction-mode pooler).
 */

const STATE = Symbol.for("swo.storageCleanup");
type StateHolder = typeof globalThis & { [STATE]?: { exportsDone?: boolean; photosDone?: boolean; photoCursor?: string | null } };
const LOCK_KEY = "swo:storage-cleanup";
/** Held for the whole pass; a pass is a few small chunks, so this is a ceiling, not an expectation. */
const LOCK_TIMEOUT_MS = 10 * 60_000;

const RETIRED = "Bulk downloads are no longer stored. Download cards from the Members page.";

/** Delete up to `limit` stored export files and close jobs that never ran. Returns how many rows changed. */
export async function purgeStoredCardExports(limit = 50) {
  const jobs = await prisma.cardExportJob.findMany({
    where: { OR: [{ storageKey: { not: null } }, { status: { in: ["PENDING", "PROCESSING"] } }] },
    select: { id: true, storageKey: true },
    take: limit,
  });
  if (jobs.length === 0) return 0;
  await deletePrivateExports(jobs.flatMap((job) => (job.storageKey ? [job.storageKey] : [])));
  const ids = jobs.map((job) => job.id);
  await prisma.cardExportJob.updateMany({ where: { id: { in: ids }, status: { in: ["PENDING", "PROCESSING"] } }, data: { status: "FAILED", error: RETIRED, lockedAt: null, finishedAt: new Date() } });
  await prisma.cardExportJob.updateMany({ where: { id: { in: ids } }, data: { storageKey: null, expiresAt: new Date() } });
  return jobs.length;
}

/** One chunk of the photo move from the cursor; done once a pass from the start finds nothing left. */
async function movePhotos(state: NonNullable<StateHolder[typeof STATE]>) {
  const from = state.photoCursor ?? null;
  const result = await migrateMemberPhotos(20, from);
  state.photoCursor = result.lastId;
  // An empty chunk after a cursor ends this pass; the next one starts again from the first member.
  return result.checked === 0 && from === null;
}

/** Run the clean-up pass unless another instance holds it. Returns whether this instance ran it. */
export async function runStorageCleanup() {
  const holder = globalThis as StateHolder;
  const state = (holder[STATE] ??= {});
  if (state.exportsDone && state.photosDone) return true;
  const failed = (part: string) => () => {
    console.error(`[storage cleanup] ${part} failed; trying again next pass`);
    return false;
  };
  return prisma.$transaction(async (tx) => {
    const [lock] = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext(${LOCK_KEY})) AS "locked"`;
    if (!lock?.locked) return false;
    if (!state.exportsDone) state.exportsDone = await purgeStoredCardExports().then((count) => count === 0, failed("export purge"));
    if (!state.photosDone) state.photosDone = await movePhotos(state).catch(failed("photo move"));
    return true;
  }, { timeout: LOCK_TIMEOUT_MS, maxWait: 10_000 });
}
