import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { can, requireOrgCapability } from "@/lib/permissions";
import { deriveStatus, statusAt } from "@/lib/membership/lifecycle";
import { memberWhere, teamScope, unitInScope } from "@/lib/membership/scope";
import { pathWithin } from "@/lib/membership/planUnits";
import { loadMemberCardPanel } from "@/lib/cards/panel";
import { memberQuestionPlans, organisationQuestionPlans } from "@/lib/membership/questionPlans";
import { answerablePlans, answersFor } from "@/lib/membership/profileQuestions";
import { loadMemberHistory } from "@/lib/views/memberHistory";
import { loadPickerGroupings, memberPickerValues } from "@/lib/groupings/pickers";

/** One member: profile, roles, every membership with its history, and consent. */
export async function loadMemberView({ params }: { params: Promise<{ orgSlug: string; memberId: string }> }) {
  const { orgSlug, memberId } = await params;
  const { organisation, membership } = await requireOrgCapability(orgSlug, "members.view");
  const scope = await teamScope(organisation.id, membership);
  const row = await prisma.member.findFirst({
    where: { AND: [memberWhere(scope), { id: memberId }] },
    select: {
      id: true, name: true, memberNumber: true, photoUrl: true, createdAt: true, anonymisedAt: true, stateCode: true, unitId: true, isMinor: true,
      guardianName: true, email: true, phone: true, guardianEmail: true, guardianPhone: true, fieldValues: true,
      unit: { select: { id: true, name: true, path: true } },
      roles: { select: { roleId: true, isPrimary: true }, orderBy: { isPrimary: "desc" } },
      consents: { orderBy: { grantedAt: "desc" }, take: 20, select: { id: true, purpose: true, noticeVersion: true, grantedAt: true, byGuardian: true, withdrawnAt: true } },
      erasureRequests: { orderBy: { createdAt: "desc" }, take: 5, select: { id: true, status: true, reason: true, createdAt: true, decidedAt: true, decisionNote: true } },
      terms: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true, planId: true, status: true, kind: true, startsAt: true, endsAt: true, graceUntil: true, createdAt: true, renewedFromId: true, reason: true, priceMinor: true, joiningFeeMinor: true, currency: true,
          plan: { select: { name: true } },
          events: { orderBy: { recordedAt: "desc" }, take: 30, select: { id: true, to: true, cause: true, effectiveAt: true, recordedAt: true } },
        },
      },
    },
  });
  if (!row) notFound();
  // Contact details leave this reader only for staff who hold members.contact.
  const showContact = can(membership, "members.contact");
  const { email, phone, guardianEmail, guardianPhone, fieldValues, ...base } = row;
  const member = { ...base, ...(showContact ? { email, phone, guardianEmail, guardianPhone } : {}) } as typeof base & { email?: string; phone?: string | null; guardianEmail?: string | null; guardianPhone?: string | null };

  const now = new Date();
  const [org, plans, roles, units, questionPlans] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id }, select: { name: true, slug: true, logoUrl: true, timezone: true, locale: true, unitLevels: true, delightEnabled: true } }),
    prisma.membershipPlan.findMany({ where: { organisationId: organisation.id, archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.memberRole.findMany({ where: { organisationId: organisation.id, archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, color: true, unit: { select: { path: true } } } }),
    prisma.orgUnit.findMany({ where: { organisationId: organisation.id, archivedAt: null }, orderBy: { path: "asc" }, select: { id: true, name: true, level: true, path: true } }),
    organisationQuestionPlans(organisation.id),
  ]);
  const held = await memberQuestionPlans(questionPlans, organisation.id, member.id);
  const questions = answerablePlans(questionPlans, held, true);

  const byPlan = new Map<string, typeof row.terms>();
  for (const term of row.terms) byPlan.set(term.planId, [...(byPlan.get(term.planId) ?? []), term]);
  const memberships = [...byPlan.entries()].map(([planId, chain]) => {
    const derived = deriveStatus(chain, now);
    return {
      planId,
      planName: chain[0].plan.name,
      status: derived.status,
      terms: chain.map((term) => ({ id: term.id, planId: term.planId, status: term.status, kind: term.kind, startsAt: term.startsAt, endsAt: term.endsAt, graceUntil: term.graceUntil, createdAt: term.createdAt, renewedFromId: term.renewedFromId, reason: term.reason, priceMinor: term.priceMinor, joiningFeeMinor: term.joiningFeeMinor, currency: term.currency, liveStatus: statusAt(term, now, chain.some((other) => other.renewedFromId === term.id && ["UPCOMING", "ACTIVE", "GRACE", "ENDED"].includes(other.status))) })),
      currentId: derived.current?.id ?? null,
    };
  });
  const timeline = row.terms
    .flatMap((term) => term.events.map((event) => ({ ...event, planName: term.plan.name })))
    .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())
    .slice(0, 40);

  // The same rule as the card download route (lib/cards/access.ts); the member is already inside this viewer's unit scope.
  const canDownloadCards = can(membership, "cards.manage") || can(membership, "members.contact");
  const cards = await loadMemberCardPanel(organisation.id, member.id, memberships.map((m) => ({ planId: m.planId, planName: m.planName, started: m.terms.some((term) => term.startsAt !== null) })), canDownloadCards);

  return {
    org,
    member,
    cards,
    canManageCards: can(membership, "cards.manage"),
    memberships,
    timeline,
    plans,
    // Roles limited to a unit are offered only to members of its subtree (plus any the member already holds, so they can be removed).
    roles: roles
      .filter((role) => !role.unit || (member.unit && pathWithin(member.unit.path, role.unit.path)) || member.roles.some((held) => held.roleId === role.id))
      .map(({ id, name, color }) => ({ id, name, color })),
    units: units.filter((unit) => unitInScope(scope, unit.path)).map(({ id, name, level }) => ({ id, name, level })),
    groupings: await loadPickerGroupings(scope),
    groupingValues: await memberPickerValues(organisation.id, member.id),
    /** The questions of every plan the member has held, for staff (admin-only ones included). */
    questions,
    answers: answersFor(questions, fieldValues),
    canManage: can(membership, "members.manage"),
    // Erasure requests are decided with their own permission, as the action checks.
    canDecideErasure: can(membership, "erasure.decide", { write: true }),
    showContact,
    /** Null unless the viewer holds members.contact (messages) or audit.view (activity). */
    ...(await loadMemberHistory({ organisationId: organisation.id, membership, scope, memberId: member.id })),
  };
}
