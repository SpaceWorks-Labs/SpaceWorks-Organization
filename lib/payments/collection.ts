import "server-only";

import { prisma } from "@/lib/db";
import { memberWhere } from "@/lib/membership/scope";
import { formatCalendarDate } from "@/lib/membership/periods";
import { amountDue, lockTermForPayment } from "./charges";
import { recordOfflinePayment, type OfflineMethod } from "./offline";
import { paymentFailure, type PaymentActionContext } from "./actionContext";

export const COLLECTION_MAX_ROWS = 200;

type CollectionRow = { termId: string; reference: string | null };

export type CollectionResult =
  | { termId: string; outcome: "recorded"; paymentId: string; settled: boolean }
  | { termId: string; outcome: "already-paid" }
  | { termId: string; outcome: "failed"; reason: string };

/**
 * Record a sheet of offline payments: one transaction per member through `recordOfflinePayment`, so each keeps the
 * payment → term → counter lock order and a failure on one row never undoes or blocks another. Rows outside the
 * collector's reach fail as not found. With maker-checker on, recorded rows wait for a second person.
 */
export async function recordCollectionRows(ctx: PaymentActionContext, args: { method: OfflineMethod; receivedOn: { year: number; month: number; day: number }; rows: CollectionRow[] }): Promise<CollectionResult[]> {
  const ids = [...new Set(args.rows.map((row) => row.termId))];
  const reachable = await prisma.membershipTerm.findMany({ where: { id: { in: ids }, organisationId: ctx.org.id, member: memberWhere(ctx.scope) }, select: { id: true } });
  const inScope = new Set(reachable.map((term) => term.id));
  const note = `Received ${formatCalendarDate(args.receivedOn)}. Collection sheet.`;
  const seen = new Set<string>();
  const results: CollectionResult[] = [];
  for (const row of args.rows) {
    if (seen.has(row.termId)) {
      results.push({ termId: row.termId, outcome: "failed", reason: "This membership is on the sheet twice." });
      continue;
    }
    seen.add(row.termId);
    if (!inScope.has(row.termId)) {
      results.push({ termId: row.termId, outcome: "failed", reason: "Membership not found." });
      continue;
    }
    try {
      const recorded = await prisma.$transaction(async (tx) => {
        // Locks the term's open payments, then the term: the same order recordOfflinePayment takes them in.
        const term = await lockTermForPayment(tx, ctx.org.id, row.termId);
        if (amountDue(term) <= 0) return null;
        return recordOfflinePayment(tx, { org: ctx.org, termId: row.termId, method: args.method, reference: row.reference, note, actorUserId: ctx.access.userId });
      });
      results.push(recorded ? { termId: row.termId, outcome: "recorded", paymentId: recorded.payment.id, settled: recorded.settled } : { termId: row.termId, outcome: "already-paid" });
    } catch (error) {
      results.push({ termId: row.termId, outcome: "failed", reason: rowFailure(error) });
    }
  }
  return results;
}

function rowFailure(error: unknown): string {
  try {
    return paymentFailure(error).error;
  } catch {
    // An unexpected failure on one row is reported, not thrown, so the rest of the sheet still stands.
    console.error("[collection] row failed", error);
    return "Couldn't record this one. Try it again on its own.";
  }
}
