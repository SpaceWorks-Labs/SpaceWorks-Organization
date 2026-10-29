import { prisma } from "@/lib/db";
import { requireOrgCapability } from "@/lib/permissions";
import { teamScope, unitInScope } from "@/lib/membership/scope";
import { organisationQuestionPlans } from "@/lib/membership/questionPlans";
import { answerablePlans } from "@/lib/membership/profileQuestions";

/** What adding or importing members needs: plans, the units this manager may use, and plan questions. */
export async function loadAddMembersView({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organisation, membership } = await requireOrgCapability(orgSlug, "members.manage");
  const scope = await teamScope(organisation.id, membership.unitId);
  const [org, plans, units, fields, questionPlans] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id }, select: { name: true, slug: true, logoUrl: true, unitLevels: true } }),
    prisma.membershipPlan.findMany({ where: { organisationId: organisation.id, archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.orgUnit.findMany({ where: { organisationId: organisation.id, archivedAt: null }, orderBy: { path: "asc" }, select: { id: true, name: true, level: true, path: true } }),
    prisma.planField.findMany({ where: { organisationId: organisation.id, section: false }, distinct: ["key"], orderBy: { sortOrder: "asc" }, select: { key: true, label: true } }),
    organisationQuestionPlans(organisation.id),
  ]);
  return {
    org,
    plans,
    units: units.filter((unit) => unitInScope(scope, unit.path)).map(({ id, name, level }) => ({ id, name, level })),
    /** Importable questions (never sections). */
    fields,
    /** Each plan's questions; the add form asks the chosen plan's. */
    questions: answerablePlans(questionPlans, questionPlans, true),
    unitLabel: org.unitLevels.at(-1) ?? "Unit",
  };
}
