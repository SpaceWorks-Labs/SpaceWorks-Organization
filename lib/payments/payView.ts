import "server-only";

import { prisma } from "@/lib/db";
import { statusAt } from "@/lib/membership/lifecycle";
import { refreshGatewayPayment } from "@/lib/payments/checkout";
import { loadPaymentGuidance } from "@/lib/payments/payGuidance";
import { chargeLines, placeOfSupply, resolveTaxSnapshot, sumSplits } from "@/lib/payments/tax";
import { currencyExponent, isCurrencyCode } from "@/lib/money/currencies";

const PAYABLE = new Set(["PENDING_PAYMENT", "EXPIRED"]);

/**
 * The pay page for one membership: what is due (with tax), whether it is already paid or being
 * checked, and every way to pay. Returning from Stripe with ?payment= settles the attempt straight away.
 */
export async function buildPayView(termId: string, organisationId: string, search: { payment?: string; cancelled?: string }) {
  if (search.payment && /^[a-z0-9]{10,40}$/i.test(search.payment)) {
    const attempt = await prisma.payment.findFirst({ where: { id: search.payment, termId }, select: { id: true } });
    if (attempt) await refreshGatewayPayment(organisationId, attempt.id).catch(() => null);
  }
  const now = new Date();
  const term = await prisma.membershipTerm.findUniqueOrThrow({
    where: { id: termId },
    include: {
      plan: { select: { name: true, paymentTiming: true } },
      member: { select: { name: true, email: true, stateCode: true, memberNumber: true, unit: { select: { path: true } } } },
      organisation: { select: { id: true, name: true, slug: true, logoUrl: true, status: true, locale: true } },
      payments: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, status: true, provider: true, utr: true, note: true, paidAt: true, documents: { where: { kind: { not: "CREDIT_NOTE" } }, select: { id: true, number: true } } } },
    },
  });
  const [tax, settings] = await Promise.all([
    prisma.orgTaxSettings.findUnique({ where: { organisationId: term.organisationId } }),
    prisma.orgPaymentSettings.findUnique({ where: { organisationId: term.organisationId } }),
  ]);
  const guidance = await loadPaymentGuidance(term.organisationId, term.member.unit?.path, term.currency, settings);
  const snapshot = resolveTaxSnapshot(tax, term.currency);
  const lines = chargeLines({ renewal: term.kind === "RENEWAL", rejoining: false, priceMinor: term.priceMinor, joiningFeeMinor: term.joiningFeeMinor, planName: term.plan.name }, snapshot, placeOfSupply(term.member.stateCode, snapshot));
  const total = sumSplits(lines);
  const status = statusAt(term, now);
  const paid = term.payments.find((payment) => payment.status === "PAID" || payment.status === "WAIVED") ?? null;
  const checking = term.payments.find((payment) => payment.status === "AWAITING_CONFIRMATION") ?? null;
  const rejected = !checking ? term.payments.find((payment) => payment.provider === "OFFLINE" && payment.status === "FAILED" && payment.utr) ?? null : null;
  const payable = !paid && total.amountMinor > 0 && term.organisation.status === "ACTIVE"
    && (PAYABLE.has(status) || (term.plan.paymentTiming === "ACTIVATE_THEN_CHARGE" && ["UPCOMING", "ACTIVE", "GRACE"].includes(status)));
  const online = payable && !guidance.offlineOnly;

  let upiUri: string | null = null;
  if (payable && settings?.upiVpa && term.currency === "INR" && isCurrencyCode(term.currency)) {
    const amount = (total.amountMinor / 10 ** currencyExponent(term.currency)).toFixed(2);
    upiUri = `upi://pay?${new URLSearchParams({ pa: settings.upiVpa, pn: settings.upiPayeeName || term.organisation.name, am: amount, cu: "INR", tn: `Membership ${term.member.memberNumber}`.slice(0, 50) })}`;
  }

  return {
    org: term.organisation,
    term: { id: term.id, kind: term.kind, currency: term.currency, planName: term.plan.name, status },
    member: { name: term.member.name, email: term.member.email, memberNumber: term.member.memberNumber },
    lines,
    total,
    taxName: snapshot.taxName,
    payable,
    online: online && settings ? { provider: settings.provider as "RAZORPAY" | "STRIPE", testMode: settings.testMode } : null,
    // Offline ways to pay: the organisation's UPI QR, then the nearest unit's instructions (or the organisation's). When
    // a unit has its own instructions the member pays the unit, so the organisation's QR isn't offered beside them.
    offline: payable
      ? guidance.fromUnit
        ? { upiVpa: null, upiUri: null, instructions: guidance.instructions, unitName: guidance.unitName, offlineOnly: guidance.offlineOnly }
        : { upiVpa: term.currency === "INR" ? settings?.upiVpa ?? null : null, upiUri, instructions: guidance.instructions, unitName: guidance.unitName, offlineOnly: guidance.offlineOnly }
      : null,
    paid: paid ? { status: paid.status, document: paid.documents[0] ?? null } : null,
    checking: checking ? { utr: checking.utr } : null,
    rejected: rejected ? { utr: rejected.utr, note: rejected.note } : null,
    cancelled: search.cancelled === "1",
  };
}
