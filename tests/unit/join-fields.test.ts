import { describe, expect, it } from "vitest";
import { DEFAULT_JOIN_FIELDS, effectiveMinor, joinFieldsSchema, parseJoinFields } from "@/lib/membership/joinFields";
import { planSchema } from "@/lib/membership/validators";

const plan = { organisationSlug: "demo", name: "Annual", slug: "annual", currency: "INR", durationType: "LIFETIME", joinMode: "OPEN" };

describe("join fields", () => {
  it("keeps today's defaults for an empty document and drops unknown keys", () => {
    expect(parseJoinFields({})).toEqual({ phone: "OPTIONAL", state: "OPTIONAL", minors: true });
    expect(parseJoinFields({ future: "ignored", phone: "REQUIRED" })).toEqual({ ...DEFAULT_JOIN_FIELDS, phone: "REQUIRED" });
    expect(parseJoinFields({ phone: "HIDDEN", state: "REQUIRED", minors: false })).toEqual({ phone: "HIDDEN", state: "REQUIRED", minors: false });
  });

  it("refuses invalid modes and non-boolean minor settings", () => {
    for (const input of [null, [], { phone: "OFF" }, { state: false }, { minors: "false" }]) {
      expect(joinFieldsSchema.safeParse(input).success).toBe(false);
    }
  });

  it("adds the join policy to plan validation with backwards-compatible defaults", () => {
    expect(planSchema.parse(plan)).toMatchObject({ joinPhoto: "OFF", joinFields: DEFAULT_JOIN_FIELDS });
    for (const joinPhoto of ["OFF", "OPTIONAL", "REQUIRED"]) {
      expect(planSchema.parse({ ...plan, joinPhoto, joinFields: { minors: false } })).toMatchObject({ joinPhoto, joinFields: { ...DEFAULT_JOIN_FIELDS, minors: false } });
    }
    expect(planSchema.safeParse({ ...plan, joinPhoto: "YES" }).success).toBe(false);
    expect(planSchema.safeParse({ ...plan, joinFields: { state: "OFF" } }).success).toBe(false);
  });
});

describe("effective minor status", () => {
  it("always keeps an existing member's stored status", () => {
    for (const isMinor of [false, true]) {
      for (const minors of [false, true]) {
        for (const submitted of [false, true]) {
          expect(effectiveMinor({ isMinor }, submitted, { ...DEFAULT_JOIN_FIELDS, minors })).toBe(isMinor);
        }
      }
    }
  });

  it("uses a new member's submitted status only when minors are enabled", () => {
    for (const existing of [null, undefined]) {
      for (const minors of [false, true]) {
        for (const submitted of [false, true]) {
          expect(effectiveMinor(existing, submitted, { ...DEFAULT_JOIN_FIELDS, minors })).toBe(minors && submitted);
        }
      }
    }
  });
});
