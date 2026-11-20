import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { termTotalMinor } from "@/lib/payments/tax";
import { PORTAL_ORGANISATION_STATUSES, verifiedEmail } from "./member";
import { answersFor, type ProfilePlan } from "@/lib/membership/profileQuestions";
import { parseRenewalPolicy } from "@/lib/membership/renewalPolicy";
import { unpaidLiveTerms, walletState, type WalletState } from "./walletStatus";

const termSelect = {
  id: true, planId: true, status: true, kind: true, startsAt: true, endsAt: true, graceUntil: true, paymentDueBy: true,
  renewedFromId: true, createdAt: true, currency: true, priceMinor: true, joiningFeeMinor: true,
  payments: { where: { status: { in: ["PAID", "WAIVED", "AWAITING_CONFIRMATION"] } }, select: { status: true } },
} satisfies Prisma.MembershipTermSelect;

const planSelect = { id: true, name: true, slug: true, durationType: true, fixedEndDate: true, lateRenewalBackdate: true, renewalWindowDays: true, joinMode: true, archivedAt: true, paymentTiming: true, renewalPolicy: true } as const;

export type WalletMembership = {
  planId: string;
  planName: string;
  planSlug: string;
  state: WalletState;
  /** Amount of the unpaid term, when there is one. */
  due: { minor: number; currency: string } | null;
  /** What the plan asks again at renewal; null when nothing. */
  reask: { photo: boolean; questions: ProfilePlan | null; answers: Record<string, string | boolean | number> } | null;
};

export type WalletEntry = {
  memberId: string;
  memberNumber: number;
  name: string;
  organisation: { id: string; slug: string; name: string; logoUrl: string | null; accentColor: string | null; status: string; timezone: string; locale: string | null };
  unitName: string | null;
  roles: Array<{ name: string; color: string; isPrimary: boolean }>;
  memberships: WalletMembership[];
  erasurePending: boolean;
};

const RANK: Record<string, number> = { ACTIVE: 0, GRACE: 1, UPCOMING: 2, PENDING_PAYMENT: 3, PENDING_APPROVAL: 4 };

/**
 * Every membership the signed-in person holds, across organisations. `null` when the account's email is
 * not verified yet: until then no member record can be claimed.
 */
export async function loadWallet(userId: string, now = new Date()): Promise<WalletEntry[] | null> {
  const email = await verifiedEmail(userId);
  if (!email) return null;
  const members = await prisma.member.findMany({
    where: { email, anonymisedAt: null, organisation: { status: { in: [...PORTAL_ORGANISATION_STATUSES] }, memberPortal: true } },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      id: true, memberNumber: true, name: true, userId: true, stateCode: true, fieldValues: true,
      organisation: { select: { id: true, slug: true, name: true, logoUrl: true, accentColor: true, status: true, timezone: true, locale: true } },
      unit: { select: { name: true } },
      roles: { where: { role: { archivedAt: null } }, orderBy: { isPrimary: "desc" }, select: { isPrimary: true, role: { select: { name: true, color: true } } } },
      terms: { orderBy: { createdAt: "asc" }, select: { ...termSelect, plan: { select: planSelect } } },
      erasureRequests: { where: { status: "PENDING" }, select: { id: true } },
    },
  });
  const taxSettings = new Map((await prisma.orgTaxSettings.findMany({ where: { organisationId: { in: [...new Set(members.map((member) => member.organisation.id))] } } })).map((row) => [row.organisationId, row]));
  const asked = [...new Set(members.flatMap((member) => member.terms).filter((term) => parseRenewalPolicy(term.plan.renewalPolicy).reaskAnswers).map((term) => term.planId))];
  const askedFields = asked.length ? await prisma.planField.findMany({ where: { planId: { in: asked } }, orderBy: { sortOrder: "asc" }, select: { planId: true, key: true, label: true, helpText: true, type: true, required: true, options: true, adminOnly: true, multiple: true, section: true, showIfKey: true, showIfValue: true } }) : [];
  const unclaimed = members.filter((member) => !member.userId).map((member) => member.id);
  if (unclaimed.length) await prisma.member.updateMany({ where: { id: { in: unclaimed }, userId: null }, data: { userId } });

  const entries = members.map((member): WalletEntry => {
    const byPlan = new Map<string, typeof member.terms>();
    for (const term of member.terms) byPlan.set(term.planId, [...(byPlan.get(term.planId) ?? []), term]);
    const memberships = [...byPlan.values()].map((chain): WalletMembership => {
      const plan = chain[0].plan;
      const state = walletState(chain, plan, { now, timeZone: member.organisation.timezone, organisationActive: member.organisation.status === "ACTIVE", unpaidLive: unpaidLiveTerms(chain) });
      const unpaid = state.actions.payTermId ? chain.find((term) => term.id === state.actions.payTermId) : null;
      const policy = parseRenewalPolicy(plan.renewalPolicy);
      const questions = policy.reaskAnswers ? { id: plan.id, fields: askedFields.filter((field) => field.planId === plan.id) } : null;
      const reask = questions || policy.reaskPhoto ? { photo: policy.reaskPhoto, questions, answers: answersFor(questions ? [questions] : [], member.fieldValues) } : null;
      return { planId: plan.id, planName: plan.name, planSlug: plan.slug, state, reask, due: unpaid ? { minor: termTotalMinor(unpaid, taxSettings.get(member.organisation.id) ?? null, unpaid.currency, member.stateCode), currency: unpaid.currency } : null };
    });
    memberships.sort((a, b) => (RANK[a.state.status] ?? 9) - (RANK[b.state.status] ?? 9));
    return {
      memberId: member.id,
      memberNumber: member.memberNumber,
      name: member.name,
      organisation: member.organisation,
      unitName: member.unit?.name ?? null,
      roles: member.roles.map((assignment) => ({ ...assignment.role, isPrimary: assignment.isPrimary })),
      memberships,
      erasurePending: member.erasureRequests.length > 0,
    };
  });
  const best = (entry: WalletEntry) => Math.min(9, ...entry.memberships.map((membership) => RANK[membership.state.status] ?? 9));
  return entries.sort((a, b) => best(a) - best(b) || a.organisation.name.localeCompare(b.organisation.name));
}
