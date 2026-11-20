"use server";

import { z } from "zod";
import { membershipChanged } from "@/lib/membership/afterChange";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { cancelPayment, confirmOfflinePayment, recordOfflinePayment, rejectOfflinePayment, waiveTermFee } from "@/lib/payments/offline";
import { OFFLINE_METHODS } from "@/lib/payments/offline-methods";
import { clearPaymentFlag, releaseHeldDocument } from "@/lib/payments/settle";
import { paymentAccess, paymentFailure, scopedPayment, scopedTerm } from "@/lib/payments/actionContext";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const id = z.string().trim().min(1).max(64);
const slug = z.string().trim().min(1).max(64);

async function refresh(org: { id: string; slug: string }, memberId?: string | null, paymentId?: string) {
  const orgSlug = org.slug;
  await membershipChanged(org.id);
  revalidatePath(`/dashboard/${orgSlug}/payments`);
  revalidatePath(`/dashboard/${orgSlug}`);
  if (paymentId) revalidatePath(`/dashboard/${orgSlug}/payments/${paymentId}`);
  if (memberId) revalidatePath(`/dashboard/${orgSlug}/members/${memberId}`);
}

const recordSchema = z.object({
  organisationSlug: slug,
  termId: id,
  method: z.enum(OFFLINE_METHODS),
  utr: z.string().trim().max(40).regex(/^[A-Za-z0-9-]*$/, "Letters, digits and hyphens only").optional().nullable(),
  reference: z.string().trim().max(80).optional().nullable(),
  note: z.string().trim().max(300).optional(),
});

/** Record money received in person or by transfer. Waits for a second person when maker-checker is on. */
export async function recordPayment(input: unknown): Promise<ActionResult<{ paymentId: string; settled: boolean }>> {
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the payment details.", fieldErrors: Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), [issue.message]])) };
  const ctx = await paymentAccess(parsed.data.organisationSlug, "payments.manage");
  if (!ctx.ok) return ctx;
  const term = await scopedTerm(ctx.scope, parsed.data.termId);
  if (!term) return { ok: false, error: "Membership not found." };
  try {
    const result = await prisma.$transaction((tx) => recordOfflinePayment(tx, { org: ctx.org, termId: term.id, method: parsed.data.method, utr: parsed.data.utr?.toUpperCase() || null, reference: parsed.data.reference || null, note: parsed.data.note, actorUserId: ctx.access.userId }));
    await refresh(ctx.org, term.memberId, result.payment.id);
    return { ok: true, data: { paymentId: result.payment.id, settled: result.settled } };
  } catch (error) {
    return paymentFailure(error);
  }
}

const paymentSchema = z.object({ organisationSlug: slug, paymentId: id });
const reasonSchema = paymentSchema.extend({ reason: z.string().trim().min(3, "Give a short reason").max(300) });

export async function confirmPayment(input: unknown): Promise<ActionResult> {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await paymentAccess(parsed.data.organisationSlug, "payments.manage");
  if (!ctx.ok) return ctx;
  const payment = await scopedPayment(ctx.scope, parsed.data.paymentId);
  if (!payment) return { ok: false, error: "Payment not found." };
  try {
    await prisma.$transaction((tx) => confirmOfflinePayment(tx, { org: ctx.org, paymentId: payment.id, actorUserId: ctx.access.userId }));
    await refresh(ctx.org, payment.memberId, payment.id);
    return { ok: true };
  } catch (error) {
    return paymentFailure(error);
  }
}

export async function rejectPayment(input: unknown): Promise<ActionResult> {
  const parsed = reasonSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const ctx = await paymentAccess(parsed.data.organisationSlug, "payments.manage");
  if (!ctx.ok) return ctx;
  const payment = await scopedPayment(ctx.scope, parsed.data.paymentId);
  if (!payment) return { ok: false, error: "Payment not found." };
  try {
    await prisma.$transaction((tx) => rejectOfflinePayment(tx, { org: ctx.org, paymentId: payment.id, actorUserId: ctx.access.userId, reason: parsed.data.reason }));
    await refresh(ctx.org, payment.memberId, payment.id);
    return { ok: true };
  } catch (error) {
    return paymentFailure(error);
  }
}

export async function cancelOpenPayment(input: unknown): Promise<ActionResult> {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await paymentAccess(parsed.data.organisationSlug, "payments.manage");
  if (!ctx.ok) return ctx;
  const payment = await scopedPayment(ctx.scope, parsed.data.paymentId);
  if (!payment) return { ok: false, error: "Payment not found." };
  try {
    await prisma.$transaction((tx) => cancelPayment(tx, { org: ctx.org, paymentId: payment.id, actorUserId: ctx.access.userId }));
    await refresh(ctx.org, payment.memberId, payment.id);
    return { ok: true };
  } catch (error) {
    return paymentFailure(error);
  }
}

const waiveSchema = z.object({ organisationSlug: slug, termId: id, reason: z.string().trim().min(3, "Give a short reason").max(300) });

/** Forgive what a member owes on a membership; it starts without a payment. */
export async function waiveFee(input: unknown): Promise<ActionResult> {
  const parsed = waiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const ctx = await paymentAccess(parsed.data.organisationSlug, "payments.manage");
  if (!ctx.ok) return ctx;
  const term = await scopedTerm(ctx.scope, parsed.data.termId);
  if (!term) return { ok: false, error: "Membership not found." };
  try {
    await prisma.$transaction((tx) => waiveTermFee(tx, { org: ctx.org, termId: term.id, actorUserId: ctx.access.userId, reason: parsed.data.reason }));
    await refresh(ctx.org, term.memberId);
    return { ok: true };
  } catch (error) {
    return paymentFailure(error);
  }
}

/** Accept a mismatched gateway amount and issue the held receipt on what was actually received. */
export async function releaseDocument(input: unknown): Promise<ActionResult> {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await paymentAccess(parsed.data.organisationSlug, "payments.manage");
  if (!ctx.ok) return ctx;
  const payment = await scopedPayment(ctx.scope, parsed.data.paymentId);
  if (!payment) return { ok: false, error: "Payment not found." };
  try {
    await prisma.$transaction((tx) => releaseHeldDocument(tx, { org: ctx.org, paymentId: payment.id, actorUserId: ctx.access.userId }));
    await refresh(ctx.org, payment.memberId, payment.id);
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.message === "This payment has no held document.") return { ok: false, error: error.message };
    return paymentFailure(error);
  }
}

export async function clearFlag(input: unknown): Promise<ActionResult> {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await paymentAccess(parsed.data.organisationSlug, "payments.manage");
  if (!ctx.ok) return ctx;
  const payment = await scopedPayment(ctx.scope, parsed.data.paymentId);
  if (!payment) return { ok: false, error: "Payment not found." };
  try {
    await prisma.$transaction((tx) => clearPaymentFlag(tx, { org: ctx.org, paymentId: payment.id, actorUserId: ctx.access.userId }));
    await refresh(ctx.org, payment.memberId, payment.id);
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.message === "Nothing to clear on this payment.") return { ok: false, error: error.message };
    return paymentFailure(error);
  }
}
