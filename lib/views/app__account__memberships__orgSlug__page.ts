import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";
import { statusAt } from "@/lib/membership/lifecycle";
import { findOwnMember } from "@/lib/portal/member";
import { unpaidLiveTerms, walletState } from "@/lib/portal/walletStatus";
import { termTotalMinor } from "@/lib/payments/tax";
import { memberRefundState } from "@/lib/payments/refundRequests";

/**
 * One organisation's membership, seen by the member: each plan's standing and history (terms and their
 * status events), and the profile they may edit. Reached only through the account's verified email.
 */
export async function loadMembershipDetailView({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const session = await requireAuth();
  const member = await findOwnMember(session.user.id, orgSlug);
  if (!member) notFound();
  const org = member.organisation;
  const now = new Date();

  const [terms, unit, roles, units, payments, taxSettings] = await Promise.all([
    prisma.membershipTerm.findMany({
      where: { organisationId: org.id, memberId: member.id },
      orderBy: { createdAt: "asc" },
      include: {
        plan: { select: { id: true, name: true, slug: true, durationType: true, fixedEndDate: true, lateRenewalBackdate: true, renewalWindowDays: true, joinMode: true, archivedAt: true, paymentTiming: true } },
        payments: { where: { status: { in: ["PAID", "WAIVED", "AWAITING_CONFIRMATION"] } }, select: { status: true } },
        events: { orderBy: { recordedAt: "asc" }, take: 60, select: { id: true, from: true, to: true, effectiveAt: true, recordedAt: true, cause: true } },
      },
    }),
    member.unitId ? prisma.orgUnit.findFirst({ where: { organisationId: org.id, id: member.unitId }, select: { name: true } }) : null,
    prisma.memberRoleAssignment.findMany({ where: { organisationId: org.id, memberId: member.id, role: { archivedAt: null } }, orderBy: { isPrimary: "desc" }, select: { isPrimary: true, role: { select: { name: true, color: true } } } }),
    prisma.orgUnit.count({ where: { organisationId: org.id, archivedAt: null } }),
    prisma.payment.findMany({
      where: { organisationId: org.id, memberId: member.id, status: { in: ["PAID", "WAIVED", "AWAITING_CONFIRMATION"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, status: true, provider: true, method: true, currency: true, amountMinor: true, paidAt: true, createdAt: true, term: { select: { plan: { select: { name: true } } } }, documents: { orderBy: { issuedAt: "asc" }, select: { id: true, number: true, kind: true } } },
    }),
    prisma.orgTaxSettings.findUnique({ where: { organisationId: org.id } }),
  ]);
  const planIds = [...new Set(terms.map((term) => term.planId))];
  const fields = (await prisma.planField.findMany({
    where: { organisationId: org.id, planId: { in: planIds }, adminOnly: false },
    orderBy: { sortOrder: "asc" },
    select: { key: true, label: true, helpText: true, type: true, required: true, options: true },
  })).filter((field, index, all) => all.findIndex((other) => other.key === field.key) === index);

  const refunds = new Map(await Promise.all(planIds.map(async (planId) => [planId, await memberRefundState(prisma, org.id, member.id, terms.filter((term) => term.planId === planId), now)] as const)));
  const memberships = planIds.map((planId) => {
    const chain = terms.filter((term) => term.planId === planId);
    const plan = chain[0].plan;
    const successors = new Set(chain.filter((term) => term.renewedFromId && ["UPCOMING", "ACTIVE", "GRACE", "ENDED"].includes(term.status)).map((term) => term.renewedFromId!));
    const state = walletState(chain, plan, { now, timeZone: org.timezone, organisationActive: org.status === "ACTIVE", unpaidLive: unpaidLiveTerms(chain) });
    const unpaid = chain.find((term) => term.id === state.actions.payTermId);
    return {
      plan: { id: plan.id, name: plan.name, slug: plan.slug },
      state,
      due: unpaid ? { minor: termTotalMinor(unpaid, taxSettings, unpaid.currency, member.stateCode), currency: unpaid.currency } : null,
      refund: refunds.get(planId) ?? null,
      terms: [...chain].reverse().map((term) => ({
        id: term.id, kind: term.kind, status: statusAt(term, now, successors.has(term.id)), startsAt: term.startsAt, endsAt: term.endsAt,
        createdAt: term.createdAt, currency: term.currency, amountMinor: term.priceMinor + term.joiningFeeMinor, reason: term.reason,
        events: term.events,
      })),
    };
  });

  const values = (member.fieldValues ?? {}) as Record<string, string | boolean | number>;
  return {
    org: { id: org.id, slug: org.slug, name: org.name, logoUrl: org.logoUrl, status: org.status, timezone: org.timezone, locale: org.locale, unitLabel: org.unitLevels.at(-1) ?? "Unit", photoUpload: org.memberPhotoUpload && org.status === "ACTIVE" },
    member: {
      id: member.id, memberNumber: member.memberNumber, name: member.name, email: member.email, phone: member.phone ?? "", stateCode: member.stateCode ?? "",
      isMinor: member.isMinor, guardianName: member.guardianName ?? "", guardianEmail: member.guardianEmail ?? "", guardianPhone: member.guardianPhone ?? "",
      unitName: unit?.name ?? null, hasUnits: units > 0, createdAt: member.createdAt, photoUrl: member.photoUrl,
      fieldValues: Object.fromEntries(fields.map((field) => [field.key, values[field.key] ?? (field.type === "CHECKBOX" ? false : "")])),
    },
    roles: roles.map((assignment) => ({ ...assignment.role, isPrimary: assignment.isPrimary })),
    fields,
    memberships,
    receipts: payments.map((payment) => ({ id: payment.id, status: payment.status, provider: payment.provider, method: payment.method, currency: payment.currency, amountMinor: payment.amountMinor, when: payment.paidAt ?? payment.createdAt, planName: payment.term?.plan.name ?? null, documents: payment.documents })),
  };
}
