"use server";

import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { localDate } from "@/lib/membership/periods";
import { parseDayKey } from "@/lib/reports/period";
import { OFFLINE_METHODS } from "@/lib/payments/offline-methods";
import { paymentAccess } from "@/lib/payments/actionContext";
import { COLLECTION_MAX_ROWS, recordCollectionRows, type CollectionResult } from "@/lib/payments/collection";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

const collectionSchema = z.object({
  organisationSlug: z.string().trim().min(1).max(64),
  method: z.enum(OFFLINE_METHODS),
  receivedOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the day the money came in"),
  rows: z.array(z.object({
    termId: z.string().trim().min(1).max(64),
    reference: z.string().trim().max(80).optional().nullable().transform((value) => value || null),
  })).min(1, "Tick at least one member").max(COLLECTION_MAX_ROWS, `At most ${COLLECTION_MAX_ROWS} members at a time`),
});

/**
 * Record offline payments for several members at once (a unit's collection sheet). Each row is its own transaction
 * and gets its own result: recorded, already paid, or failed with the reason.
 */
export async function recordCollection(input: unknown): Promise<ActionResult<{ results: CollectionResult[] }>> {
  const parsed = collectionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the sheet." };
  const ctx = await paymentAccess(parsed.data.organisationSlug, "payments.manage");
  if (!ctx.ok) return ctx;
  const receivedOn = parseDayKey(parsed.data.receivedOn);
  const today = localDate(new Date(), ctx.org.timezone);
  const yearAgo = { ...today, year: today.year - 1 };
  const key = (date: { year: number; month: number; day: number }) => date.year * 10_000 + date.month * 100 + date.day;
  if (!receivedOn || key(receivedOn) > key(today) || key(receivedOn) < key(yearAgo)) return { ok: false, error: "Choose a day in the last year, not in the future.", fieldErrors: { receivedOn: ["Not a day in the last year"] } };
  const results = await recordCollectionRows(ctx, { method: parsed.data.method, receivedOn, rows: parsed.data.rows });
  revalidatePath(`/dashboard/${ctx.org.slug}/payments`);
  revalidatePath(`/dashboard/${ctx.org.slug}/payments/collect`);
  revalidatePath(`/dashboard/${ctx.org.slug}`);
  return { ok: true, data: { results } };
}
