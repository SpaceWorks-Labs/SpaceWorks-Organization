import { DEFAULT_RENEWAL_POLICY, parseRenewalPolicy, type RenewalPolicy } from "@/lib/membership/renewalPolicy";

/** A plan's renewal conditions as the person types them. */
export type RenewalFormValues = {
  requireApproval: boolean;
  reaskAnswers: boolean;
  reaskPhoto: boolean;
  eligibleGroupId: string;
  extraGraceDays: string;
  intoPlanId: string;
  intoAge: string;
  intoYears: string;
  intoGroupId: string;
};

export const EMPTY_RENEWAL: RenewalFormValues = {
  requireApproval: false, reaskAnswers: false, reaskPhoto: false, eligibleGroupId: "", extraGraceDays: "0", intoPlanId: "", intoAge: "", intoYears: "", intoGroupId: "",
};

export function renewalToValues(stored: unknown): RenewalFormValues {
  const policy = parseRenewalPolicy(stored);
  const into = policy.renewInto;
  return {
    requireApproval: policy.requireApproval,
    reaskAnswers: policy.reaskAnswers,
    reaskPhoto: policy.reaskPhoto,
    eligibleGroupId: policy.eligibleGroupId ?? "",
    extraGraceDays: String(policy.extraGraceDays),
    intoPlanId: into?.targetPlanId ?? "",
    intoAge: into?.when.ageAtLeast ? String(into.when.ageAtLeast) : "",
    intoYears: into?.when.afterYears ? String(into.when.afterYears) : "",
    intoGroupId: into?.when.smartGroupId ?? "",
  };
}

/** What the plan actions expect. A renew-into plan without a condition is dropped. */
export function renewalToPayload(values: RenewalFormValues): RenewalPolicy {
  const age = Number(values.intoAge);
  const years = Number(values.intoYears);
  const when = { ...(age > 0 ? { ageAtLeast: age } : {}), ...(years > 0 ? { afterYears: years } : {}), ...(values.intoGroupId ? { smartGroupId: values.intoGroupId } : {}) };
  return {
    ...DEFAULT_RENEWAL_POLICY,
    requireApproval: values.requireApproval,
    reaskAnswers: values.reaskAnswers,
    reaskPhoto: values.reaskPhoto,
    eligibleGroupId: values.eligibleGroupId || null,
    extraGraceDays: Number(values.extraGraceDays) || 0,
    renewInto: values.intoPlanId && Object.keys(when).length ? { targetPlanId: values.intoPlanId, when } : null,
  };
}
