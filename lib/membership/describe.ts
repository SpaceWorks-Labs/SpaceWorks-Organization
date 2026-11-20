import { money } from "@/lib/money/currencies";

/** Words for plan settings, shared by the dashboard and public pages. Client-safe. */

type PlanSummary = {
  durationType: "ROLLING" | "ORG_YEAR" | "FIXED_END" | "LIFETIME";
  durationMonths: number | null;
  fixedEndDate: Date | string | null;
  currency: string;
  priceNewMinor: number;
  priceRenewalMinor: number;
  joiningFeeMinor: number;
  joinMode: "OPEN" | "APPROVAL" | "INVITE_ONLY" | "CLOSED";
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export { money };

/** "1 year (Apr–Mar)", "6 months", "Until 31 Dec 2026", "Lifetime". */
export function describeDuration(plan: Pick<PlanSummary, "durationType" | "durationMonths" | "fixedEndDate">, financialYearStartMonth = 4) {
  switch (plan.durationType) {
    case "ROLLING": {
      const months = plan.durationMonths ?? 12;
      if (months % 12 === 0) return months === 12 ? "1 year from joining" : `${months / 12} years from joining`;
      return months === 1 ? "1 month" : `${months} months`;
    }
    case "ORG_YEAR": {
      const start = MONTHS[financialYearStartMonth - 1].slice(0, 3);
      const end = MONTHS[(financialYearStartMonth + 10) % 12].slice(0, 3);
      return `Financial year (${start}–${end})`;
    }
    case "FIXED_END": {
      if (!plan.fixedEndDate) return "Until a fixed date";
      const date = new Date(plan.fixedEndDate);
      return `Until ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date)}`;
    }
    case "LIFETIME":
      return "Lifetime";
  }
}

/** "₹1,200" or "Free", plus a joining fee line when there is one. */
export function describePrice(plan: Pick<PlanSummary, "currency" | "priceNewMinor" | "priceRenewalMinor" | "joiningFeeMinor">, locale?: string | null) {
  const price = plan.priceNewMinor === 0 ? "Free" : money(plan.priceNewMinor, plan.currency, locale);
  const extras: string[] = [];
  if (plan.joiningFeeMinor > 0) extras.push(`+ ${money(plan.joiningFeeMinor, plan.currency, locale)} joining fee`);
  if (plan.priceRenewalMinor !== plan.priceNewMinor) extras.push(plan.priceRenewalMinor === 0 ? "free to renew" : `renews at ${money(plan.priceRenewalMinor, plan.currency, locale)}`);
  return { price, extras };
}

export const JOIN_MODE_LABELS: Record<PlanSummary["joinMode"], { label: string; description: string }> = {
  OPEN: { label: "Open to all", description: "Anyone can join straight away." },
  APPROVAL: { label: "Apply and approve", description: "People apply; a manager approves each one." },
  INVITE_ONLY: { label: "Invite only", description: "Only people with an invitation can join." },
  CLOSED: { label: "Closed", description: "No new members. Existing members can still renew." },
};

export const DURATION_LABELS: Record<PlanSummary["durationType"], { label: string; description: string }> = {
  ORG_YEAR: { label: "Financial year", description: "Everyone renews together at the start of the year." },
  ROLLING: { label: "Fixed length", description: "Runs for a number of months from the day it starts." },
  FIXED_END: { label: "Until a date", description: "Ends on one date for everyone, e.g. a season." },
  LIFETIME: { label: "Lifetime", description: "Never ends. No renewals." },
};

/** Status filters on the member directory, in tab order. */
export const MEMBER_FILTERS = ["all", "active", "approval", "payment", "grace", "lapsed", "expiring"] as const;
export type MemberFilter = (typeof MEMBER_FILTERS)[number];
