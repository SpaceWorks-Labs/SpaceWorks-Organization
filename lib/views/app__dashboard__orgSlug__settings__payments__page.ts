import { prisma } from "@/lib/db";
import { can, requireOrgCapability } from "@/lib/permissions";
import { getRequestOrigin } from "@/lib/publicUrl";
import { ensurePaymentSettings, webhookPath } from "@/lib/payments/config";
import { paymentSecretsConfigured } from "@/lib/payments/secrets";

/** Gateway, tax and offline payment settings. Secrets never leave the server; only whether one is saved. */
export async function loadPaymentSettingsView({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organisation, membership } = await requireOrgCapability(orgSlug, "payments.view");
  const [org, settings, tax, origin] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id }, select: { name: true, slug: true, logoUrl: true, stateCode: true, currency: true } }),
    ensurePaymentSettings(organisation.id),
    prisma.orgTaxSettings.findUnique({ where: { organisationId: organisation.id } }),
    getRequestOrigin(),
  ]);
  const canEdit = can(membership, "payments.settings", { write: true });
  return {
    org,
    canEdit,
    secretsReady: paymentSecretsConfigured(),
    gateway: {
      provider: settings.provider,
      keyId: settings.keyId,
      hasSecret: Boolean(settings.secretEncrypted),
      hasWebhookSecret: Boolean(settings.webhookSecretEncrypted),
      testMode: settings.testMode,
      verifiedAt: settings.verifiedAt,
      webhookUrls: canEdit ? { RAZORPAY: `${origin}${webhookPath("RAZORPAY", settings.webhookPublicCode)}`, STRIPE: `${origin}${webhookPath("STRIPE", settings.webhookPublicCode)}` } : null,
    },
    offline: { upiVpa: settings.upiVpa ?? "", upiPayeeName: settings.upiPayeeName ?? "", offlineInstructions: settings.offlineInstructions },
    refunds: { refundPolicy: settings.refundPolicy, refundWindowDays: settings.refundWindowDays, refundPolicyText: settings.refundPolicyText },
    tax: {
      mode: tax?.mode ?? "NONE",
      scheme: tax?.scheme ?? "REGULAR",
      gstin: tax?.gstin ?? "",
      legalName: tax?.legalName ?? org.name,
      address: tax?.address ?? "",
      stateCode: tax?.stateCode ?? org.stateCode ?? "",
      sacCode: tax?.sacCode ?? "999599",
      rateBps: tax?.rateBps ?? 1800,
      inclusive: tax?.inclusive ?? true,
      exempt: tax?.exempt ?? false,
      foreignCurrencyTax: tax?.foreignCurrencyTax ?? "NO_TAX",
      lutNumber: tax?.lutNumber ?? "",
      simpleTaxName: tax?.simpleTaxName ?? "Tax",
      receiptPrefix: tax?.receiptPrefix ?? "",
    },
  };
}
