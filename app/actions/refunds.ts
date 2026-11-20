"use server";

import { z } from "zod";
import { membershipChanged } from "@/lib/membership/afterChange";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { createRefund } from "@/lib/payments/refunds";
import { sendRefundToGateway } from "@/lib/payments/refundGateway";
import { afterDirectRefund, approveRefundRequest, declineRefundRequest } from "@/lib/payments/refundRequests";
import { paymentAccess, paymentFailure, scopedPayment, type PaymentActionContext } from "@/lib/payments/actionContext";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const id = z.string().trim().min(1).max(64);
const slug = z.string().trim().min(1).max(64);
type Status = "PENDING" | "PROCESSED" | "FAILED";

async function refresh(ctx: PaymentActionContext, payment: { id: string; memberId: string }) {
  await membershipChanged(ctx.org.id);
  revalidatePath(`/dashboard/${ctx.org.slug}/payments/${payment.id}`);
  revalidatePath(`/dashboard/${ctx.org.slug}/payments`);
  revalidatePath(`/dashboard/${ctx.org.slug}/members/${payment.memberId}`);
  revalidatePath(`/account/memberships/${ctx.org.slug}`);
}

const refundSchema = z.object({
  organisationSlug: slug,
  paymentId: id,
  amountMinor: z.number().int().positive(),
  reason: z.string().trim().min(3, "Give a short reason").max(300),
  endMembership: z.boolean().default(false),
});

/**
 * Refund all or part of a paid payment, optionally ending the membership it paid for. Offline refunds are
 * recorded as already handed back. Gateway refunds are sent to the provider after the refund row commits and
 * tracked to PROCESSED by its answer, its webhook or the scheduler; the credit note follows the money.
 */
export async function refundPayment(input: unknown): Promise<ActionResult<{ status: Status }>> {
  const parsed = refundSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const ctx = await paymentAccess(parsed.data.organisationSlug, "payments.manage");
  if (!ctx.ok) return ctx;
  const payment = await scopedPayment(ctx.scope, parsed.data.paymentId);
  if (!payment) return { ok: false, error: "Payment not found." };
  let created: Awaited<ReturnType<typeof createRefund>>;
  try {
    created = await prisma.$transaction(async (tx) => {
      const refund = await createRefund(tx, { org: ctx.org, paymentId: payment.id, amountMinor: parsed.data.amountMinor, reason: parsed.data.reason, actorUserId: ctx.access.userId });
      await afterDirectRefund(tx, { org: ctx.org, paymentId: payment.id, termId: payment.termId, refundId: refund.refund.id, endMembership: parsed.data.endMembership, actorUserId: ctx.access.userId });
      return refund;
    });
  } catch (error) {
    return paymentFailure(error);
  }
  const outcome = await sendRefundToGateway(ctx.org, created);
  await refresh(ctx, payment);
  return outcome.ok ? { ok: true, data: { status: outcome.status } } : outcome;
}

const approveSchema = z.object({
  organisationSlug: slug,
  requestId: id,
  amountMinor: z.number().int().positive("Enter an amount to refund"),
  endMembership: z.boolean(),
  note: z.string().trim().max(500).optional(),
});

/** Approve a member's refund request: refund the amount and, unless unticked, end the membership. */
export async function approveRefund(input: unknown): Promise<ActionResult<{ status: Status }>> {
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const ctx = await paymentAccess(parsed.data.organisationSlug, "payments.manage");
  if (!ctx.ok) return ctx;
  const request = await prisma.refundRequest.findFirst({ where: { id: parsed.data.requestId, organisationId: ctx.org.id }, select: { paymentId: true } });
  const payment = request ? await scopedPayment(ctx.scope, request.paymentId) : null;
  if (!payment) return { ok: false, error: "Refund request not found." };
  let created: Awaited<ReturnType<typeof approveRefundRequest>>["created"];
  try {
    ({ created } = await prisma.$transaction((tx) => approveRefundRequest(tx, { org: ctx.org, requestId: parsed.data.requestId, amountMinor: parsed.data.amountMinor, endMembership: parsed.data.endMembership, note: parsed.data.note, actorUserId: ctx.access.userId })));
  } catch (error) {
    return paymentFailure(error);
  }
  const outcome = await sendRefundToGateway(ctx.org, created);
  await refresh(ctx, payment);
  return outcome.ok ? { ok: true, data: { status: outcome.status } } : outcome;
}

const declineSchema = z.object({ organisationSlug: slug, requestId: id, note: z.string().trim().min(3, "Tell the member why").max(500) });

/** Decline a member's refund request with a note; the membership carries on. */
export async function declineRefund(input: unknown): Promise<ActionResult> {
  const parsed = declineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const ctx = await paymentAccess(parsed.data.organisationSlug, "payments.manage");
  if (!ctx.ok) return ctx;
  const request = await prisma.refundRequest.findFirst({ where: { id: parsed.data.requestId, organisationId: ctx.org.id }, select: { paymentId: true } });
  const payment = request ? await scopedPayment(ctx.scope, request.paymentId) : null;
  if (!payment) return { ok: false, error: "Refund request not found." };
  try {
    await prisma.$transaction((tx) => declineRefundRequest(tx, { org: ctx.org, requestId: parsed.data.requestId, note: parsed.data.note, actorUserId: ctx.access.userId }));
  } catch (error) {
    return paymentFailure(error);
  }
  await refresh(ctx, payment);
  return { ok: true };
}
