import { z } from "zod";
import { isIndianStateCode } from "@/lib/indianStates";
import { isCurrencyCode, parseAmount, type CurrencyCode } from "@/lib/money/currencies";
import { isReservedPlanSlug } from "@/lib/slug";

/** The privacy notice version members agree to when they join. Bump it when the notice changes. */
export const MEMBERSHIP_NOTICE_VERSION = "2026-10";

const slug = z
  .string()
  .trim()
  .min(2, "At least 2 characters")
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lowercase letters, numbers and single hyphens");

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((value) => value || null);
const id = z.string().trim().min(1).max(64);
const dayList = z
  .array(z.coerce.number().int().min(0).max(365))
  .max(6)
  .transform((days) => [...new Set(days)].sort((a, b) => b - a));

/** Amounts arrive as typed text ("1,200.50") and are parsed against the plan's currency. */
const amountText = z.string().trim().max(24).optional().default("0");

export const planSchema = z
  .object({
    organisationSlug: z.string().trim().min(1),
    name: z.string().trim().min(2, "Name the plan").max(80),
    slug: slug.refine((value) => !isReservedPlanSlug(value), "That address is reserved"),
    description: z.string().trim().max(2000).optional().default(""),
    currency: z.string().refine(isCurrencyCode, "Choose a currency"),
    durationType: z.enum(["ROLLING", "ORG_YEAR", "FIXED_END", "LIFETIME"]),
    durationMonths: z.coerce.number().int().min(1).max(120).optional().nullable(),
    fixedEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose an end date").optional().nullable(),
    priceNew: amountText,
    priceRenewal: amountText,
    joiningFee: amountText,
    rejoinFeeRule: z.enum(["NEVER", "ONCE", "EACH_JOIN", "AFTER_LAPSE"]).default("NEVER"),
    rejoinAfterDays: z.coerce.number().int().min(1).max(3650).optional().nullable(),
    graceDays: z.coerce.number().int().min(0).max(365).default(15),
    renewalWindowDays: z.coerce.number().int().min(0).max(365).default(30),
    reminderDaysBefore: dayList.default([30, 7, 0]),
    reminderDaysAfter: dayList.default([7]),
    lateRenewalBackdate: z.boolean().default(true),
    joinMode: z.enum(["OPEN", "APPROVAL", "INVITE_ONLY", "CLOSED"]),
    paymentTiming: z.enum(["PAY_THEN_ACTIVATE", "ACTIVATE_THEN_CHARGE"]).default("PAY_THEN_ACTIVATE"),
    allUnits: z.boolean().default(true),
    unitIds: z.array(id).max(500).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.durationType === "ROLLING" && !value.durationMonths) ctx.addIssue({ code: "custom", path: ["durationMonths"], message: "How many months does it last?" });
    if (value.durationType === "FIXED_END" && !value.fixedEndDate) ctx.addIssue({ code: "custom", path: ["fixedEndDate"], message: "Choose the last day" });
    if (value.rejoinFeeRule === "AFTER_LAPSE" && !value.rejoinAfterDays) ctx.addIssue({ code: "custom", path: ["rejoinAfterDays"], message: "After how many days?" });
    if (!value.allUnits && value.unitIds.length === 0) ctx.addIssue({ code: "custom", path: ["unitIds"], message: "Choose at least one unit, or open it to all" });
    for (const key of ["priceNew", "priceRenewal", "joiningFee"] as const) {
      if (isCurrencyCode(value.currency) && parseAmount(value[key] || "0", value.currency) === null) {
        ctx.addIssue({ code: "custom", path: [key], message: "Enter an amount like 1200 or 1200.50" });
      }
    }
  })
  .transform((value) => {
    const currency = value.currency as CurrencyCode;
    return {
      ...value,
      currency,
      priceNewMinor: parseAmount(value.priceNew || "0", currency) ?? 0,
      priceRenewalMinor: parseAmount(value.priceRenewal || "0", currency) ?? 0,
      joiningFeeMinor: parseAmount(value.joiningFee || "0", currency) ?? 0,
      durationMonths: value.durationType === "ROLLING" ? value.durationMonths ?? 12 : null,
      fixedEndDate: value.durationType === "FIXED_END" && value.fixedEndDate ? new Date(`${value.fixedEndDate}T00:00:00Z`) : null,
      rejoinAfterDays: value.rejoinFeeRule === "AFTER_LAPSE" ? value.rejoinAfterDays ?? 365 : null,
    };
  });

const planFieldSchema = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,39}$/, "Keys are lowercase letters, numbers and underscores"),
  label: z.string().trim().min(1, "Label the question").max(120),
  helpText: z.string().trim().max(300).optional().default(""),
  type: z.enum(["TEXT", "LONG_TEXT", "SELECT", "DATE", "EMAIL", "PHONE", "NUMBER", "CHECKBOX"]),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  adminOnly: z.boolean().default(false),
});

export const planFieldsSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  planId: id,
  fields: z
    .array(planFieldSchema)
    .max(40)
    .superRefine((fields, ctx) => {
      const keys = new Set<string>();
      fields.forEach((field, index) => {
        if (keys.has(field.key)) ctx.addIssue({ code: "custom", path: [index, "key"], message: "Each question needs its own key" });
        keys.add(field.key);
        if (field.type === "SELECT" && field.options.length < 2) ctx.addIssue({ code: "custom", path: [index, "options"], message: "Give at least two choices" });
      });
    }),
});

export const unitCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,6}$/, "1 to 6 letters or digits");

export const unitSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  name: z.string().trim().min(2, "Name the unit").max(80),
  slug,
  /** Left out, a code is made from the name. */
  code: unitCodeSchema.optional(),
  parentId: id.optional().nullable(),
});

export const unitLevelsSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  levels: z.array(z.string().trim().min(2).max(40)).max(4),
});

export const memberRoleSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  name: z.string().trim().min(2, "Name the role").max(60),
  description: z.string().trim().max(200).optional().default(""),
  color: z.enum(["teal", "citron", "sky", "yellow", "orange", "ink"]).default("teal"),
  unitId: id.optional().nullable(),
});

export const memberProfileSchema = z
  .object({
    name: z.string().trim().min(2, "Enter the full name").max(120),
    email: z.string().trim().toLowerCase().email("Enter a valid email address").max(320),
    phone: optionalText(32).refine((value) => value === null || /^[+0-9 ()-]{6,32}$/.test(value), "Enter a valid phone number"),
    stateCode: z.string().optional().nullable().refine((value) => !value || isIndianStateCode(value), "Choose a state").transform((value) => value || null),
    unitId: id.optional().nullable().transform((value) => value || null),
    isMinor: z.boolean().default(false),
    guardianName: optionalText(120),
    guardianEmail: z.string().trim().toLowerCase().email().max(320).optional().or(z.literal("")).transform((value) => value || null),
    guardianPhone: optionalText(32),
    fieldValues: z.record(z.string(), z.union([z.string().max(2000), z.boolean(), z.number()])).default({}),
  })
  .superRefine((value, ctx) => {
    if (value.isMinor && !value.guardianName) ctx.addIssue({ code: "custom", path: ["guardianName"], message: "A guardian is needed for members under 18" });
    if (value.isMinor && !value.guardianEmail) ctx.addIssue({ code: "custom", path: ["guardianEmail"], message: "The guardian's email is needed" });
  });

type FieldDef = { key: string; label: string; type: string; required: boolean; options: string[]; adminOnly: boolean };

/**
 * Check answers to a plan's custom questions. Unknown keys are dropped; admin-only questions are kept
 * only when a manager fills the form.
 */
export function validateFieldValues(fields: FieldDef[], values: Record<string, unknown>, byManager: boolean) {
  const clean: Record<string, string | boolean | number> = {};
  const errors: Record<string, string[]> = {};
  for (const field of fields) {
    if (field.adminOnly && !byManager) continue;
    const raw = values[field.key];
    const empty = raw === undefined || raw === null || raw === "" || raw === false;
    if (empty) {
      if (field.required && !(field.adminOnly && !byManager)) errors[`fieldValues.${field.key}`] = [`${field.label} is required`];
      continue;
    }
    const text = typeof raw === "string" ? raw.trim() : raw;
    switch (field.type) {
      case "CHECKBOX":
        clean[field.key] = raw === true || raw === "true" || raw === "on";
        break;
      case "NUMBER": {
        const number = typeof text === "number" ? text : Number(text);
        if (!Number.isFinite(number)) errors[`fieldValues.${field.key}`] = ["Enter a number"];
        else clean[field.key] = number;
        break;
      }
      case "SELECT":
        if (typeof text !== "string" || !field.options.includes(text)) errors[`fieldValues.${field.key}`] = ["Choose one of the options"];
        else clean[field.key] = text;
        break;
      case "DATE":
        if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(text)) errors[`fieldValues.${field.key}`] = ["Enter a date"];
        else clean[field.key] = text;
        break;
      case "EMAIL":
        if (typeof text !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) errors[`fieldValues.${field.key}`] = ["Enter a valid email address"];
        else clean[field.key] = text.toLowerCase();
        break;
      default:
        clean[field.key] = String(text).slice(0, field.type === "LONG_TEXT" ? 2000 : 300);
    }
  }
  return { values: clean, errors };
}
