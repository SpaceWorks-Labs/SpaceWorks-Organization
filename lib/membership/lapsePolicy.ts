import { parseRenewalPolicy } from "./renewalPolicy";

/**
 * When a term lapses: the plan's grace days, plus the extra days its renewal policy keeps a member in grace.
 * Zero extra days lapses right after grace. Used where a term's grace end is set, so the sweep needs no rule.
 */
export function effectiveGraceDays(plan: { graceDays: number; renewalPolicy?: unknown }): number {
  return plan.graceDays + parseRenewalPolicy(plan.renewalPolicy).extraGraceDays;
}
