"use server";

import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { gstStateCode, isIndianStateCode } from "@/lib/indianStates";
import { credentialsOf, ensurePaymentSettings, GATEWAYS, looksLikeTestKey, savePaymentKeys } from "@/lib/payments/config";
import { RECEIPT_PREFIX_PATTERN } from "@/lib/payments/numbering";
import { paymentAccess, paymentFailure } from "@/lib/payments/actionContext";
import { POLL_FOR_MS } from "@/lib/payments/reconcile";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const slug = z.string().trim().min(1).max(64);
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform((value) => value || null);

const gatewaySchema = z.object({
  organisationSlug: slug,
  provider: z.enum(["NONE", "RAZORPAY", "STRIPE"]),
  keyId: optionalText(80),
  secret: optionalText(300),
  webhookSecret: optionalText(300),
}).superRefine((value, ctx) => {
  if (value.provider === "RAZORPAY" && value.keyId && !/^rzp_(test|live)_[A-Za-z0-9]+$/.test(value.keyId)) ctx.addIssue({ code: "custom", path: ["keyId"], message: "A Razorpay key id starts with rzp_test_ or rzp_live_" });
  if (value.provider === "STRIPE" && value.secret && !/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(value.secret)) ctx.addIssue({ code: "custom", path: ["secret"], message: "A Stripe secret key starts with sk_ or rk_" });
  if (value.provider === "STRIPE" && value.webhookSecret && !value.webhookSecret.startsWith("whsec_")) ctx.addIssue({ code: "custom", path: ["webhookSecret"], message: "A Stripe signing secret starts with whsec_" });
});

function fieldErrors(error: z.ZodError) {
  return Object.fromEntries(error.issues.map((issue) => [String(issue.path[0]), [issue.message]]));
}

/** Choose the gateway and save its keys. Blank secrets keep the saved ones. Test mode follows the key. */
export async function savePaymentGateway(input: unknown): Promise<ActionResult> {
  const parsed = gatewaySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const ctx = await paymentAccess(parsed.data.organisationSlug, "payments.settings");
  if (!ctx.ok) return ctx;
  const current = await ensurePaymentSettings(ctx.org.id);
  const { provider, keyId, secret, webhookSecret } = parsed.data;
  const switching = current.provider !== provider;
  // Webhooks and polling only reach the saved provider, so switching would strand its open attempts. Look back
  // as far as the reconcile job keeps them open.
  if (switching && current.provider !== "NONE") {
    const open = await prisma.payment.count({ where: { organisationId: ctx.org.id, provider: current.provider, status: "PENDING", createdAt: { gte: new Date(Date.now() - POLL_FOR_MS) } } });
    if (open > 0) return { ok: false, error: `${open} online ${open === 1 ? "payment is" : "payments are"} still in progress with the current gateway. Switch once ${open === 1 ? "it finishes or is" : "they finish or are"} cancelled on the Payments page.` };
  }
  if (provider === "RAZORPAY" && !keyId && (switching || !current.keyId)) return { ok: false, error: "Enter the key id.", fieldErrors: { keyId: ["Required"] } };
  if (provider !== "NONE" && !secret && (switching || !current.secretEncrypted)) return { ok: false, error: "Enter the secret key.", fieldErrors: { secret: ["Required"] } };
  const probe = provider === "RAZORPAY" ? keyId ?? current.keyId ?? "" : secret ?? "";
  try {
    await savePaymentKeys(ctx.org.id, { provider, keyId, secret, webhookSecret, testMode: probe ? looksLikeTestKey(provider, probe) : current.testMode });
  } catch (error) {
    return paymentFailure(error);
  }
  await recordAuditEvent({ action: "PAYMENT_GATEWAY_SAVED", actorUserId: ctx.access.userId, organisationId: ctx.org.id, targetType: "Organisation", targetId: ctx.org.id, metadata: { provider, keysChanged: Boolean(keyId || secret || webhookSecret) } });
  revalidatePath(`/dashboard/${ctx.org.slug}/settings/payments`);
  return { ok: true };
}

/** Check the saved keys with the provider and remember when they last worked. */
export async function testPaymentGateway(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ organisationSlug: slug }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await paymentAccess(parsed.data.organisationSlug, "payments.settings");
  if (!ctx.ok) return ctx;
  const settings = await ensurePaymentSettings(ctx.org.id);
  let credentials;
  try {
    credentials = credentialsOf(settings);
  } catch (error) {
    return paymentFailure(error);
  }
  if (settings.provider === "NONE" || !credentials) return { ok: false, error: "Save a gateway and its keys first." };
  const result = await GATEWAYS[settings.provider].testConnection(credentials);
  if (!result.ok) return { ok: false, error: `The provider rejected the keys: ${result.error}` };
  await prisma.orgPaymentSettings.update({ where: { organisationId: ctx.org.id }, data: { verifiedAt: new Date() } });
  revalidatePath(`/dashboard/${ctx.org.slug}/settings/payments`);
  return { ok: true };
}

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const taxSchema = z.object({
  organisationSlug: slug,
  mode: z.enum(["NONE", "SIMPLE", "GST"]),
  scheme: z.enum(["REGULAR", "COMPOSITION"]),
  gstin: optionalText(15).transform((value) => value?.toUpperCase() ?? null),
  legalName: optionalText(160),
  address: optionalText(300),
  stateCode: optionalText(2),
  sacCode: z.string().trim().regex(/^[0-9]{4,8}$/, "Four to eight digits"),
  rateBps: z.number().int().min(0).max(10000),
  inclusive: z.boolean(),
  exempt: z.boolean(),
  foreignCurrencyTax: z.enum(["EXPORT_LUT", "NO_TAX"]),
  lutNumber: optionalText(40),
  simpleTaxName: z.string().trim().min(1).max(20),
  receiptPrefix: z.string().trim().toUpperCase().regex(RECEIPT_PREFIX_PATTERN, "Up to four letters or digits"),
}).superRefine((value, ctx) => {
  if (value.mode !== "GST") return;
  if (!value.gstin || !GSTIN.test(value.gstin)) ctx.addIssue({ code: "custom", path: ["gstin"], message: "Enter a valid 15-character GSTIN" });
  if (!value.legalName) ctx.addIssue({ code: "custom", path: ["legalName"], message: "Required for GST documents" });
  if (!value.stateCode || !isIndianStateCode(value.stateCode)) ctx.addIssue({ code: "custom", path: ["stateCode"], message: "Choose the state you're registered in" });
  else if (value.gstin && value.gstin.slice(0, 2) !== gstStateCode(value.stateCode)) ctx.addIssue({ code: "custom", path: ["gstin"], message: "The GSTIN doesn't match the state" });
  if (![0, 25, 100, 300, 500, 1200, 1800, 2800].includes(value.rateBps) && value.scheme === "REGULAR" && !value.exempt) ctx.addIssue({ code: "custom", path: ["rateBps"], message: "Choose a GST rate" });
  if (value.foreignCurrencyTax === "EXPORT_LUT" && !value.lutNumber) ctx.addIssue({ code: "custom", path: ["lutNumber"], message: "Enter your LUT reference" });
});

/** Tax mode and the details printed on receipts and tax invoices. Applies to payments created from now on. */
export async function saveTaxSettings(input: unknown): Promise<ActionResult> {
  const parsed = taxSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const ctx = await paymentAccess(parsed.data.organisationSlug, "payments.settings");
  if (!ctx.ok) return ctx;
  const { organisationSlug: _, ...data } = parsed.data;
  void _;
  await prisma.orgTaxSettings.upsert({ where: { organisationId: ctx.org.id }, create: { organisationId: ctx.org.id, ...data }, update: data });
  await recordAuditEvent({ action: "TAX_SETTINGS_SAVED", actorUserId: ctx.access.userId, organisationId: ctx.org.id, targetType: "Organisation", targetId: ctx.org.id, metadata: { mode: data.mode } });
  revalidatePath(`/dashboard/${ctx.org.slug}/settings/payments`);
  return { ok: true };
}

const offlineSchema = z.object({
  organisationSlug: slug,
  upiVpa: optionalText(80).refine((value) => !value || /^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9.-]{1,32}$/.test(value), "Enter a UPI ID like club@bank"),
  upiPayeeName: optionalText(80),
  offlineInstructions: z.string().trim().max(1500),
});

/** How members pay outside the gateway: a UPI ID (shown as a QR) and free-form bank or cash instructions. */
export async function saveOfflinePaymentSettings(input: unknown): Promise<ActionResult> {
  const parsed = offlineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const ctx = await paymentAccess(parsed.data.organisationSlug, "payments.settings");
  if (!ctx.ok) return ctx;
  await ensurePaymentSettings(ctx.org.id);
  await prisma.orgPaymentSettings.update({ where: { organisationId: ctx.org.id }, data: { upiVpa: parsed.data.upiVpa, upiPayeeName: parsed.data.upiPayeeName, offlineInstructions: parsed.data.offlineInstructions } });
  revalidatePath(`/dashboard/${ctx.org.slug}/settings/payments`);
  return { ok: true };
}

const refundPolicySchema = z.object({
  organisationSlug: slug,
  refundPolicy: z.enum(["NONE", "FULL", "PRO_RATA"]),
  refundWindowDays: z.number().int().min(1, "At least 1 day").max(365, "At most 365 days"),
  refundPolicyText: z.string().trim().max(2000),
});

/** What members may get back when they cancel, how long they have to ask, and the policy in your words. */
export async function saveRefundPolicy(input: unknown): Promise<ActionResult> {
  const parsed = refundPolicySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const ctx = await paymentAccess(parsed.data.organisationSlug, "payments.settings");
  if (!ctx.ok) return ctx;
  await ensurePaymentSettings(ctx.org.id);
  const { organisationSlug: _, ...data } = parsed.data;
  void _;
  await prisma.orgPaymentSettings.update({ where: { organisationId: ctx.org.id }, data });
  await recordAuditEvent({ action: "REFUND_POLICY_SAVED", actorUserId: ctx.access.userId, organisationId: ctx.org.id, targetType: "Organisation", targetId: ctx.org.id, metadata: { refundPolicy: data.refundPolicy, refundWindowDays: data.refundWindowDays } });
  revalidatePath(`/dashboard/${ctx.org.slug}/settings/payments`);
  return { ok: true };
}
