import "server-only";

import type { MembershipPlan, MembershipTerm, Organisation, Prisma } from "@prisma/client";
import { memberInSmartGroup } from "@/lib/groups/conditions";
import { MembershipError } from "./errors";
import type { PreparedMemberPhoto } from "./photo";
import { lockMemberByEmail } from "./memberLock";
import { canRenewNow, formatCalendarDate, localDate } from "./periods";
import { dobFromAnswers, ageOn, parseRenewalPolicy, renewIntoApplies, yearsSince } from "./renewalPolicy";
import { organisationQuestionPlans } from "./questionPlans";
import { replacePlanAnswers, validatePlanAnswers } from "./planAnswers";

type Tx = Prisma.TransactionClient;
type OrgClock = Pick<Organisation, "id" | "timezone" | "financialYearStartMonth">;

/** What a member sends again when a plan asks for it at renewal. */
export type RenewalReask = { answers?: Record<string, unknown> | null; photo?: PreparedMemberPhoto | null };

/** Everything evaluated before a renewal opens: refusals, the plan it goes into, and whether it needs approval. */
export async function evaluateRenewal(
  tx: Tx,
  args: { org: OrgClock; plan: MembershipPlan; memberId: string; latest: MembershipTerm; byManager: boolean; reask?: RenewalReask; now: Date },
): Promise<{ plan: MembershipPlan; needsApproval: boolean; intoPlan: boolean }> {
  const { org, plan, latest, byManager, now } = args;
  const policy = parseRenewalPolicy(plan.renewalPolicy);
  const member = await tx.member.findUniqueOrThrow({ where: { id: args.memberId }, select: { id: true, email: true, fieldValues: true, organisationId: true } });

  if (!byManager) {
    if (!canRenewNow(latest.endsAt, latest.graceUntil, plan.renewalWindowDays, now) && latest.endsAt) {
      const opens = new Date(latest.endsAt.getTime() - plan.renewalWindowDays * 86_400_000);
      throw new MembershipError(now < opens ? `Renewal opens on ${formatCalendarDate(localDate(opens, org.timezone))}.` : "The time to renew this membership has passed. Join again instead.");
    }
    if (policy.eligibleGroupId && !(await memberInSmartGroup(org.id, policy.eligibleGroupId, member.id))) {
      throw new MembershipError("This membership can't be renewed by you. Ask the organisation if you think that's a mistake.");
    }
  }

  let target = plan;
  if (policy.renewInto) {
    const { targetPlanId, when } = policy.renewInto;
    const first = await tx.membershipTerm.findFirst({ where: { memberId: member.id, planId: plan.id, startsAt: { not: null } }, orderBy: { startsAt: "asc" }, select: { startsAt: true } });
    const facts = {
      age: ageOn(dobFromAnswers(member.fieldValues), now, org.timezone),
      years: first?.startsAt ? yearsSince(first.startsAt, now, org.timezone) : 0,
      inGroup: when.smartGroupId ? await memberInSmartGroup(org.id, when.smartGroupId, member.id) : null,
    };
    if (renewIntoApplies(when, facts)) {
      const next = await tx.membershipPlan.findFirst({ where: { id: targetPlanId, organisationId: org.id, archivedAt: null } });
      if (next && next.id !== plan.id) target = next;
    }
  }

  if (!byManager) {
    if (policy.reaskPhoto && !args.reask?.photo) throw new MembershipError("Add a current photo to renew.");
    if (policy.reaskAnswers) {
      if (!args.reask?.answers) throw new MembershipError("Check your details to renew.");
      const organisationPlans = await organisationQuestionPlans(org.id, tx);
      const fields = await tx.planField.findMany({ where: { planId: plan.id }, orderBy: { sortOrder: "asc" } });
      const checked = validatePlanAnswers(fields, args.reask.answers, false, { organisationPlans });
      const problem = Object.values(checked.errors)[0]?.[0];
      if (problem) throw new MembershipError(problem);
      const locked = await lockMemberByEmail(tx, org.id, member.email);
      const fieldValues = replacePlanAnswers((locked?.fieldValues ?? {}) as Record<string, unknown>, fields, args.reask.answers, false, { organisationPlans });
      await tx.member.update({ where: { id: member.id }, data: { fieldValues: fieldValues as Prisma.InputJsonValue } });
    }
  }
  return { plan: target, needsApproval: !byManager && policy.requireApproval, intoPlan: target.id !== plan.id };
}
