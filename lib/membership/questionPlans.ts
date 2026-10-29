import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { ProfilePlan } from "./profileQuestions";

type Client = Prisma.TransactionClient;

const QUESTION_SELECT = {
  key: true, label: true, helpText: true, type: true, required: true, options: true, adminOnly: true,
  multiple: true, section: true, showIfKey: true, showIfValue: true, sortOrder: true,
} satisfies Prisma.PlanFieldSelect;

/** Every plan of the organisation, archived ones too, in plan order, with its questions in question order. */
export function organisationQuestionPlans(organisationId: string, client: Client = prisma): Promise<ProfilePlan[]> {
  return client.membershipPlan.findMany({
    where: { organisationId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, fields: { orderBy: { sortOrder: "asc" }, select: QUESTION_SELECT } },
  });
}

/** The plans a member has held a membership on (any status), in plan order. */
export async function memberQuestionPlans(organisationPlans: readonly ProfilePlan[], organisationId: string, memberId: string, client: Client = prisma) {
  const terms = await client.membershipTerm.findMany({ where: { organisationId, memberId }, distinct: ["planId"], select: { planId: true } });
  const held = new Set(terms.map((term) => term.planId));
  return organisationPlans.filter((plan) => held.has(plan.id));
}
