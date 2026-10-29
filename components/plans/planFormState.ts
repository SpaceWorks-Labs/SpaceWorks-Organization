import { isCurrencyCode, toInputValue } from "@/lib/money/currencies";
import { DEFAULT_JOIN_FIELDS, joinFieldsSchema, type JoinFields } from "@/lib/membership/joinFields";

/** The plan editor's values, all as the person types them. */
export type PlanFormValues = {
  name: string;
  slug: string;
  description: string;
  currency: string;
  durationType: "ROLLING" | "ORG_YEAR" | "FIXED_END" | "LIFETIME";
  durationMonths: string;
  fixedEndDate: string;
  priceNew: string;
  priceRenewal: string;
  joiningFee: string;
  rejoinFeeRule: "NEVER" | "ONCE" | "EACH_JOIN" | "AFTER_LAPSE";
  rejoinAfterDays: string;
  graceDays: string;
  renewalWindowDays: string;
  reminderDaysBefore: string;
  reminderDaysAfter: string;
  lateRenewalBackdate: boolean;
  joinMode: "OPEN" | "APPROVAL" | "INVITE_ONLY" | "CLOSED";
  joinPhoto: "OFF" | "OPTIONAL" | "REQUIRED";
  joinFields: JoinFields;
  paymentTiming: "PAY_THEN_ACTIVATE" | "ACTIVATE_THEN_CHARGE";
  allUnits: boolean;
  unitIds: string[];
};

export function emptyPlan(currency: string): PlanFormValues {
  return {
    name: "",
    slug: "",
    description: "",
    currency,
    durationType: "ORG_YEAR",
    durationMonths: "12",
    fixedEndDate: "",
    priceNew: "",
    priceRenewal: "",
    joiningFee: "",
    rejoinFeeRule: "NEVER",
    rejoinAfterDays: "365",
    graceDays: "15",
    renewalWindowDays: "30",
    reminderDaysBefore: "30, 7, 0",
    reminderDaysAfter: "7",
    lateRenewalBackdate: true,
    joinMode: "APPROVAL",
    joinPhoto: "OFF",
    joinFields: DEFAULT_JOIN_FIELDS,
    paymentTiming: "PAY_THEN_ACTIVATE",
    allUnits: true,
    unitIds: [],
  };
}

type StoredPlan = Omit<PlanFormValues, "joinPhoto" | "joinFields" | "durationMonths" | "fixedEndDate" | "priceNew" | "priceRenewal" | "joiningFee" | "rejoinAfterDays" | "graceDays" | "renewalWindowDays" | "reminderDaysBefore" | "reminderDaysAfter" | "unitIds"> & {
  durationMonths: number | null;
  fixedEndDate: Date | null;
  priceNewMinor: number;
  priceRenewalMinor: number;
  joiningFeeMinor: number;
  rejoinAfterDays: number | null;
  graceDays: number;
  renewalWindowDays: number;
  reminderDaysBefore: number[];
  reminderDaysAfter: number[];
  units: Array<{ unitId: string }>;
  joinPhoto: string;
  joinFields: unknown;
};

/** A saved plan back into editable values. */
export function planToValues(plan: StoredPlan): PlanFormValues {
  const amount = (minor: number) => (minor === 0 ? "" : isCurrencyCode(plan.currency) ? toInputValue(minor, plan.currency) : String(minor));
  return {
    name: plan.name,
    slug: plan.slug,
    description: plan.description,
    currency: plan.currency,
    durationType: plan.durationType,
    durationMonths: String(plan.durationMonths ?? 12),
    fixedEndDate: plan.fixedEndDate ? plan.fixedEndDate.toISOString().slice(0, 10) : "",
    priceNew: amount(plan.priceNewMinor),
    priceRenewal: amount(plan.priceRenewalMinor),
    joiningFee: amount(plan.joiningFeeMinor),
    rejoinFeeRule: plan.rejoinFeeRule,
    rejoinAfterDays: String(plan.rejoinAfterDays ?? 365),
    graceDays: String(plan.graceDays),
    renewalWindowDays: String(plan.renewalWindowDays),
    reminderDaysBefore: plan.reminderDaysBefore.join(", "),
    reminderDaysAfter: plan.reminderDaysAfter.join(", "),
    lateRenewalBackdate: plan.lateRenewalBackdate,
    joinMode: plan.joinMode,
    joinPhoto: plan.joinPhoto === "OPTIONAL" || plan.joinPhoto === "REQUIRED" ? plan.joinPhoto : "OFF",
    joinFields: joinFieldsSchema.safeParse(plan.joinFields).data ?? DEFAULT_JOIN_FIELDS,
    paymentTiming: plan.paymentTiming,
    allUnits: plan.allUnits,
    unitIds: plan.units.map((unit) => unit.unitId),
  };
}

const dayList = (text: string) => text.split(/[\s,]+/).filter(Boolean).map(Number).filter((n) => Number.isInteger(n) && n >= 0);

/** What the plan actions expect. An empty renewal price means "same as joining". */
export function valuesToPayload(values: PlanFormValues) {
  return {
    ...values,
    priceNew: values.priceNew || "0",
    priceRenewal: values.priceRenewal || values.priceNew || "0",
    joiningFee: values.joiningFee || "0",
    durationMonths: values.durationType === "ROLLING" ? values.durationMonths : null,
    fixedEndDate: values.durationType === "FIXED_END" ? values.fixedEndDate : null,
    rejoinAfterDays: values.rejoinFeeRule === "AFTER_LAPSE" ? values.rejoinAfterDays : null,
    reminderDaysBefore: dayList(values.reminderDaysBefore),
    reminderDaysAfter: dayList(values.reminderDaysAfter),
  };
}
