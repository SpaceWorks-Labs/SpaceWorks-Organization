"use server";

import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isCurrencyCode } from "@/lib/money/currencies";
import { localDate } from "@/lib/membership/periods";
import { LEDGER_METHODS } from "@/lib/accounts/categories";
import { paymentAccess } from "@/lib/payments/actionContext";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const slug = z.string().trim().min(1).max(64);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");
const currency = z.string().refine(isCurrencyCode, "Choose a currency");

function fieldErrors(error: z.ZodError) {
  return Object.fromEntries(error.issues.map((issue) => [String(issue.path[0]), [issue.message]]));
}

/** The accounts are kept for the whole organisation, so `accounts.manage` is refused to staff limited to one unit. */
function access(organisationSlug: string) {
  return paymentAccess(organisationSlug, "accounts.manage");
}

const entrySchema = z.object({
  organisationSlug: slug,
  direction: z.enum(["RECEIPT", "PAYMENT"]),
  occurredOn: day,
  category: z.string().trim().min(1, "Choose or type a category").max(60),
  party: z.string().trim().max(120).default(""),
  description: z.string().trim().max(300).default(""),
  currency,
  amountMinor: z.number().int().positive("Enter an amount").max(1_000_000_000_00),
  method: z.enum(LEDGER_METHODS),
  reference: z.string().trim().max(80).optional().nullable().transform((value) => value || null),
});

/** Record money the organisation received or paid outside membership payments. */
export async function addLedgerEntry(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const today = localDate(new Date(), ctx.org.timezone);
  const todayKey = `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
  if (parsed.data.occurredOn > todayKey) return { ok: false, error: "The date can't be in the future.", fieldErrors: { occurredOn: ["Can't be in the future"] } };
  const { organisationSlug: _, occurredOn, ...data } = parsed.data;
  void _;
  const entry = await prisma.ledgerEntry.create({ data: { ...data, organisationId: ctx.org.id, occurredOn: new Date(`${occurredOn}T00:00:00Z`), recordedById: ctx.access.userId } });
  await recordAuditEvent({ action: "LEDGER_ENTRY_ADDED", actorUserId: ctx.access.userId, organisationId: ctx.org.id, targetType: "LedgerEntry", targetId: entry.id, metadata: { direction: entry.direction, currency: entry.currency, amountMinor: entry.amountMinor } });
  revalidatePath(`/dashboard/${ctx.org.slug}/accounts`);
  return { ok: true, data: { id: entry.id } };
}

const voidSchema = z.object({ organisationSlug: slug, entryId: z.string().trim().min(1).max(64), reason: z.string().trim().min(3, "Give a short reason").max(300) });

/** A mistaken entry is voided, never deleted: it stays visible, struck through, with the reason. */
export async function voidLedgerEntry(input: unknown): Promise<ActionResult> {
  const parsed = voidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const { count } = await prisma.ledgerEntry.updateMany({ where: { id: parsed.data.entryId, organisationId: ctx.org.id, voidedAt: null }, data: { voidedAt: new Date(), voidedById: ctx.access.userId, voidReason: parsed.data.reason } });
  if (count === 0) return { ok: false, error: "That entry was already voided or doesn't exist." };
  await recordAuditEvent({ action: "LEDGER_ENTRY_VOIDED", actorUserId: ctx.access.userId, organisationId: ctx.org.id, targetType: "LedgerEntry", targetId: parsed.data.entryId, metadata: { reason: parsed.data.reason } });
  revalidatePath(`/dashboard/${ctx.org.slug}/accounts`);
  return { ok: true };
}

const openingSchema = z.object({
  organisationSlug: slug,
  financialYear: z.string().regex(/^\d{4}(-\d{2})?$/),
  currency,
  cashMinor: z.number().int().min(-1_000_000_000_00).max(1_000_000_000_00),
  bankMinor: z.number().int().min(-1_000_000_000_00).max(1_000_000_000_00),
});

/** Cash in hand and at the bank at the start of a financial year, as the accounts carried forward. */
export async function setOpeningBalance(input: unknown): Promise<ActionResult> {
  const parsed = openingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the amounts.", fieldErrors: fieldErrors(parsed.error) };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const { organisationSlug: _, financialYear, currency: code, cashMinor, bankMinor } = parsed.data;
  void _;
  await prisma.openingBalance.upsert({
    where: { organisationId_financialYear_currency: { organisationId: ctx.org.id, financialYear, currency: code } },
    create: { organisationId: ctx.org.id, financialYear, currency: code, cashMinor, bankMinor, updatedById: ctx.access.userId },
    update: { cashMinor, bankMinor, updatedById: ctx.access.userId },
  });
  await recordAuditEvent({ action: "OPENING_BALANCE_SET", actorUserId: ctx.access.userId, organisationId: ctx.org.id, targetType: "Organisation", targetId: ctx.org.id, metadata: { financialYear, currency: code, cashMinor, bankMinor } });
  revalidatePath(`/dashboard/${ctx.org.slug}/accounts`);
  return { ok: true };
}
