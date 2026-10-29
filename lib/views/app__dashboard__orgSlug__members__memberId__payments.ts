import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { can, requireOrgCapability } from "@/lib/permissions";
import { memberWhere, teamScope } from "@/lib/membership/scope";
import { statusAt } from "@/lib/membership/lifecycle";
import { termTotalMinor } from "@/lib/payments/tax";

/**
 * The payments side of one member's page: what they owe on each membership and every payment with its
 * documents. Empty for roles without payment access, so the panel simply does not show.
 */
export async function loadMemberPayments({ params }: { params: Promise<{ orgSlug: string; memberId: string }> }) {
  const { orgSlug, memberId } = await params;
  const { organisation, membership } = await requireOrgCapability(orgSlug, "members.view");
  if (!can(membership, "payments.view")) return null;
  const scope = await teamScope(organisation.id, membership.unitId);
  const member = await prisma.member.findFirst({ where: { AND: [memberWhere(scope), { id: memberId }] }, select: { id: true } });
  if (!member) notFound();
  const now = new Date();
  const [org, terms, payments, taxSettings, memberState] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id }, select: { slug: true, locale: true, timezone: true, offlineConfirmationRequired: true } }),
    prisma.membershipTerm.findMany({
      where: { organisationId: organisation.id, memberId },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, startsAt: true, endsAt: true, graceUntil: true, paymentDueBy: true, createdAt: true, kind: true, currency: true, priceMinor: true, joiningFeeMinor: true, plan: { select: { name: true, paymentTiming: true } }, payments: { where: { status: { in: ["PAID", "WAIVED", "AWAITING_CONFIRMATION"] } }, select: { status: true } } },
    }),
    prisma.payment.findMany({
      where: { organisationId: organisation.id, memberId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, status: true, provider: true, method: true, currency: true, amountMinor: true, paidAt: true, createdAt: true, flaggedAt: true, utr: true,
        term: { select: { plan: { select: { name: true } } } },
        documents: { select: { id: true, number: true, kind: true }, orderBy: { issuedAt: "asc" } },
        refunds: { select: { amountMinor: true, status: true } },
      },
    }),
    prisma.orgTaxSettings.findUnique({ where: { organisationId: organisation.id } }),
    prisma.member.findUniqueOrThrow({ where: { id: memberId }, select: { stateCode: true } }),
  ]);
  // What the member would pay now, tax included (it differs from the plan price under exclusive pricing).
  const dueWithTax = (term: (typeof terms)[number]) => {
    return termTotalMinor(term, taxSettings, term.currency, memberState.stateCode);
  };
  const due = terms
    .filter((term) => term.priceMinor + term.joiningFeeMinor > 0 && !term.payments.some((payment) => payment.status !== "AWAITING_CONFIRMATION"))
    .map((term) => ({ term, status: statusAt(term, now) }))
    .filter(({ term, status }) => status === "PENDING_PAYMENT" || status === "EXPIRED" || (term.plan.paymentTiming === "ACTIVATE_THEN_CHARGE" && ["UPCOMING", "ACTIVE", "GRACE"].includes(status)))
    .map(({ term, status }) => ({ termId: term.id, planName: term.plan.name, status, currency: term.currency, amountMinor: dueWithTax(term), awaiting: term.payments.some((payment) => payment.status === "AWAITING_CONFIRMATION") }));
  return { org, due, payments, canManage: can(membership, "payments.manage") };
}
