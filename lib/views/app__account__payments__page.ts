import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";
import { PORTAL_ORGANISATION_STATUSES, verifiedEmail } from "@/lib/portal/member";

/**
 * Every payment the signed-in person made, across organisations, with its receipts and credit notes.
 * Reached only through the account's verified email, like the rest of the portal.
 */
export async function loadAccountPaymentsView() {
  const session = await requireAuth();
  const email = await verifiedEmail(session.user.id);
  if (!email) return { emailVerified: false, payments: [] };
  const payments = await prisma.payment.findMany({
    where: { member: { email, anonymisedAt: null }, organisation: { memberPortal: true, status: { in: [...PORTAL_ORGANISATION_STATUSES] } }, status: { in: ["PAID", "WAIVED", "AWAITING_CONFIRMATION"] } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true, status: true, provider: true, method: true, currency: true, amountMinor: true, paidAt: true, createdAt: true,
      organisation: { select: { name: true, slug: true, timezone: true, locale: true } },
      term: { select: { plan: { select: { name: true } } } },
      documents: { orderBy: { issuedAt: "asc" }, select: { id: true, number: true, kind: true } },
      refunds: { where: { status: "PROCESSED" }, select: { amountMinor: true } },
    },
  });
  return {
    emailVerified: true,
    payments: payments.map((payment) => ({
      id: payment.id,
      status: payment.status,
      provider: payment.provider,
      method: payment.method,
      currency: payment.currency,
      amountMinor: payment.amountMinor,
      refundedMinor: payment.refunds.reduce((sum, refund) => sum + refund.amountMinor, 0),
      when: payment.paidAt ?? payment.createdAt,
      organisation: payment.organisation,
      planName: payment.term?.plan.name ?? null,
      documents: payment.documents,
    })),
  };
}
