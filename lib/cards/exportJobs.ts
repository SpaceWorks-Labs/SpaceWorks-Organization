import "server-only";

import type { CardExportJob } from "@prisma/client";
import { prisma } from "@/lib/db";
import { teamScope } from "@/lib/membership/scope";
import { slugForFile } from "@/lib/downloads";
import { deletePrivateExports, privateExportKey, uploadPrivateExport } from "@/lib/storage/private";
import { CARD_INCLUDE, cardRoleId, designFor, holderFor, loadCardOrgContext, type CardOrgContext } from "./data";
import { exportCardsWhere, parseExportFilter, type CardExportFormat } from "./exportFilter";
import { BULK_PDF_LIMIT, BULK_ZIP_LIMIT, renderMemberCardsPdf, renderMemberCardsZip, type CardInput } from "./render";
import { tryAcquireRenderSlot } from "./renderSlot";

/*
 * Bulk card exports run in the background, from the same scheduler pass as the outbox
 * (lib/outboxWorker.ts): a row is claimed PENDING → PROCESSING, a claim left by a crashed worker is
 * returned after 30 minutes, and a job fails for good after three attempts. The file goes to private
 * storage and is deleted after seven days.
 */

const STALE_MS = 30 * 60_000;
const KEEP_MS = 7 * 86_400_000;
const MAX_ATTEMPTS = 3;
const PAGE = 100;

/** A problem the requester can fix (shown on the exports list); it is not retried. */
class ExportError extends Error {
  override name = "ExportError";
}

export function exportLimit(format: CardExportFormat) {
  return format === "zip" ? BULK_ZIP_LIMIT : BULK_PDF_LIMIT;
}

async function* exportCards(job: CardExportJob, ctx: CardOrgContext) {
  const filter = (job.filter ?? {}) as Record<string, unknown>;
  const scope = await teamScope(job.organisationId, typeof filter.scopeUnitId === "string" ? filter.scopeUnitId : null);
  const where = exportCardsWhere(scope, parseExportFilter(filter), job.createdAt);
  const designs = new Map<string, CardInput>();
  let cursor: string | undefined;
  for (;;) {
    const cards = await prisma.memberCard.findMany({ where, include: CARD_INCLUDE, orderBy: { id: "asc" }, take: PAGE, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}) });
    for (const card of cards) {
      let input = designs.get(card.planId);
      if (!input) {
        const { design, branding } = designFor(ctx, card.plan, cardRoleId(card));
        input = { design, branding };
        designs.set(card.planId, input);
      }
      yield { input, holder: holderFor(card, ctx) };
    }
    if (cards.length < PAGE) return;
    cursor = cards.at(-1)!.id;
  }
}

async function buildExport(job: CardExportJob) {
  const ctx = await loadCardOrgContext(job.organisationId);
  if (!ctx) throw new ExportError("Organisation not found.");
  const format = job.format as CardExportFormat;
  const filter = (job.filter ?? {}) as Record<string, unknown>;
  const scope = await teamScope(job.organisationId, typeof filter.scopeUnitId === "string" ? filter.scopeUnitId : null);
  const count = await prisma.memberCard.count({ where: exportCardsWhere(scope, parseExportFilter(filter), job.createdAt) });
  if (count === 0) throw new ExportError("No cards match this filter.");
  if (count > exportLimit(format)) throw new ExportError(`${count} cards match; one export takes up to ${exportLimit(format)}. Narrow the filter.`);
  const title = `${ctx.organisation.name} membership cards`;
  const body = format === "zip"
    ? await renderMemberCardsZip(exportCards(job, ctx), (holder) => `${holder.idNumber ?? "card"}-${slugForFile(holder.planName ?? "", "plan")}-${slugForFile(holder.displayName, "member")}.pdf`)
    : await renderMemberCardsPdf(exportCards(job, ctx), format === "sheet" ? "a4" : "card", title);
  const key = privateExportKey(job.organisationId, format === "zip" ? "zip" : "pdf");
  await uploadPrivateExport(key, body, job.organisationId);
  return { key, byteSize: body.byteLength, count };
}

/** Delete export files past their expiry; the job rows stay as a record. */
async function purgeExpired(now: Date) {
  const expired = await prisma.cardExportJob.findMany({ where: { expiresAt: { lt: now }, storageKey: { not: null } }, select: { id: true, storageKey: true }, take: 50 });
  if (expired.length === 0) return;
  await deletePrivateExports(expired.map((job) => job.storageKey!));
  await prisma.cardExportJob.updateMany({ where: { id: { in: expired.map((job) => job.id) } }, data: { storageKey: null } });
}

/** Run at most `limit` waiting exports. Call from the scheduler, never a request path. */
export async function runCardExportJobs(limit = 1, now = new Date()) {
  // A claim left by a crashed worker goes back to the queue, unless it has crashed too often (an export
  // that runs the process out of memory must not crash it again every half hour).
  const stale = { status: "PROCESSING" as const, lockedAt: { lt: new Date(now.getTime() - STALE_MS) } };
  await prisma.cardExportJob.updateMany({ where: { ...stale, attempts: { gte: MAX_ATTEMPTS } }, data: { status: "FAILED", lockedAt: null, error: "The export couldn't be built.", finishedAt: now } });
  await prisma.cardExportJob.updateMany({ where: stale, data: { status: "PENDING", lockedAt: null } });
  await purgeExpired(now);
  let done = 0;
  for (let index = 0; index < limit; index += 1) {
    const job = await prisma.cardExportJob.findFirst({ where: { status: "PENDING", attempts: { lt: MAX_ATTEMPTS } }, orderBy: { createdAt: "asc" } });
    if (!job) break;
    const claim = await prisma.cardExportJob.updateMany({ where: { id: job.id, status: "PENDING", attempts: { lt: MAX_ATTEMPTS } }, data: { status: "PROCESSING", lockedAt: new Date(), attempts: { increment: 1 } } });
    if (claim.count !== 1) continue;
    const release = tryAcquireRenderSlot();
    if (!release) {
      // Another bulk render holds this process; leave the job for the next pass.
      await prisma.cardExportJob.updateMany({ where: { id: job.id, status: "PROCESSING" }, data: { status: "PENDING", lockedAt: null, attempts: { decrement: 1 } } });
      break;
    }
    try {
      const result = await buildExport(job);
      const finishedAt = new Date();
      await prisma.cardExportJob.update({
        where: { id: job.id },
        data: { status: "DONE", storageKey: result.key, byteSize: result.byteSize, cardCount: result.count, error: null, lockedAt: null, finishedAt, expiresAt: new Date(finishedAt.getTime() + KEEP_MS) },
      });
      done += 1;
    } catch (error) {
      const message = error instanceof ExportError ? error.message : "The export couldn't be built.";
      const final = job.attempts + 1 >= MAX_ATTEMPTS || error instanceof ExportError;
      await prisma.cardExportJob.update({ where: { id: job.id }, data: { status: final ? "FAILED" : "PENDING", error: message, lockedAt: null, ...(final ? { finishedAt: new Date() } : {}) } });
      if (!final) console.error("[card exports] export failed; will retry");
    } finally {
      release();
    }
  }
  return { done };
}

const RUNNING = Symbol.for("swo.cardExportRun");
type RunHolder = typeof globalThis & { [RUNNING]?: boolean };

/**
 * Start an export pass without waiting for it, so a long render never holds up the scheduler's mail
 * and sweep. One pass at a time per process; an interrupted pass is picked up by the stale reclaim.
 */
export function kickCardExportJobs() {
  const holder = globalThis as RunHolder;
  if (holder[RUNNING]) return;
  holder[RUNNING] = true;
  void runCardExportJobs()
    .catch(() => console.error("[card exports] run failed"))
    .finally(() => {
      holder[RUNNING] = false;
    });
}
