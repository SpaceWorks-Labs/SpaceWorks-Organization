import { z } from "zod";
import { localDate, type CalendarDate } from "./periods";

/**
 * Renewal conditions of one plan (MembershipPlan.renewalPolicy). Pure and client-safe. The window and the
 * grace period stay on the plan (`renewalWindowDays`, `graceDays`); this holds the rest.
 */

const id = z.string().trim().min(1).max(64);

export const renewInto = z.object({
  targetPlanId: id,
  /** Every condition given must hold. */
  when: z
    .object({
      ageAtLeast: z.number().int().min(1).max(120).optional(),
      afterYears: z.number().int().min(1).max(100).optional(),
      smartGroupId: id.optional(),
    })
    .refine((when) => when.ageAtLeast !== undefined || when.afterYears !== undefined || when.smartGroupId !== undefined, "Choose when it applies"),
});

export const renewalPolicySchema = z.object({
  requireApproval: z.boolean().default(false),
  reaskAnswers: z.boolean().default(false),
  reaskPhoto: z.boolean().default(false),
  /** Only members of this smart group may renew. */
  eligibleGroupId: id.nullable().default(null),
  renewInto: renewInto.nullable().default(null),
  /** Days kept in grace on top of the plan's grace days before a term lapses. */
  extraGraceDays: z.number().int().min(0).max(365).default(0),
});

export type RenewalPolicy = z.infer<typeof renewalPolicySchema>;
export type RenewInto = z.infer<typeof renewInto>;

export const DEFAULT_RENEWAL_POLICY: RenewalPolicy = renewalPolicySchema.parse({});

/** The stored policy, or the defaults when it is empty or unreadable. */
export function parseRenewalPolicy(value: unknown): RenewalPolicy {
  return renewalPolicySchema.safeParse(value ?? {}).data ?? DEFAULT_RENEWAL_POLICY;
}

const DOB_KEYS = ["dob", "date_of_birth", "birth_date", "birthdate"];

/** The date of birth a member gave on a join form, as YYYY-MM-DD, or null. */
export function dobFromAnswers(values: unknown): string | null {
  if (!values || typeof values !== "object") return null;
  for (const key of DOB_KEYS) {
    const value = (values as Record<string, unknown>)[key];
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  }
  return null;
}

function yearsBetween(from: CalendarDate, to: CalendarDate) {
  const before = to.month < from.month || (to.month === from.month && to.day < from.day);
  return to.year - from.year - (before ? 1 : 0);
}

/** Whole years old on `now` (in the organisation's timezone), or null without a date of birth. */
export function ageOn(dob: string | null, now: Date, timeZone: string): number | null {
  if (!dob) return null;
  const [year, month, day] = dob.split("-").map(Number);
  return year ? yearsBetween({ year, month, day }, localDate(now, timeZone)) : null;
}

/** Whole years from the first start to now. */
export function yearsSince(start: Date, now: Date, timeZone: string): number {
  return yearsBetween(localDate(start, timeZone), localDate(now, timeZone));
}

/** Whether every condition of a renew-into rule holds. A condition that cannot be checked does not hold. */
export function renewIntoApplies(when: RenewInto["when"], facts: { age: number | null; years: number; inGroup: boolean | null }): boolean {
  if (when.ageAtLeast !== undefined && !(facts.age !== null && facts.age >= when.ageAtLeast)) return false;
  if (when.afterYears !== undefined && facts.years < when.afterYears) return false;
  if (when.smartGroupId !== undefined && facts.inGroup !== true) return false;
  return true;
}
