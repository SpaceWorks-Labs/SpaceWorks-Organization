import { describe, expect, it } from "vitest";
import { DEFAULT_JOIN_FIELDS } from "@/lib/membership/joinFields";
import { joinProfile, joinSettingErrors, readJoinInput } from "@/lib/membership/joinSubmission";
import { conflictingKeys, type FieldDef } from "@/lib/membership/planAnswers";

const field = (key: string, extra: Partial<FieldDef> = {}): FieldDef => ({ key, label: key, type: "TEXT", required: false, options: [], adminOnly: false, ...extra });
const photo = new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" });
const settings = { fields: DEFAULT_JOIN_FIELDS, profile: { phone: null, stateCode: null }, minor: false, guardianConsent: false, photoMode: "OPTIONAL" as const, photo: null, hasPhoto: false };

describe("join submission input", () => {
  it("reads FormData's payload and photo, and takes a plain object as the payload", () => {
    const form = new FormData();
    form.set("payload", JSON.stringify({ planSlug: "annual" }));
    form.set("photo", photo);
    expect(readJoinInput(form)).toEqual({ payload: { planSlug: "annual" }, photo: expect.any(File) });
    form.set("payload", "{broken");
    form.set("photo", new File([], "empty.png"));
    expect(readJoinInput(form)).toEqual({ payload: null, photo: null });
    expect(readJoinInput({ planSlug: "annual" })).toEqual({ payload: { planSlug: "annual" }, photo: null });
  });

  it("drops hidden details and guardian details unless the effective minor status is true", () => {
    const raw = { phone: "123456", stateCode: "KL", isMinor: true, guardianName: "Parent" };
    const hidden = { phone: "HIDDEN", state: "HIDDEN", minors: false } as const;
    expect(joinProfile(raw, hidden, null)).toEqual({ minor: false, profile: { ...raw, phone: undefined, stateCode: undefined, isMinor: false, guardianName: undefined, guardianEmail: undefined, guardianPhone: undefined } });
    expect(joinProfile({ ...raw, isMinor: false }, hidden, { isMinor: true })).toMatchObject({ minor: true, profile: { isMinor: true, guardianName: "Parent" } });
    expect(joinProfile(raw, DEFAULT_JOIN_FIELDS, { isMinor: false }).minor).toBe(false);
  });

  it("enforces required details, guardian consent and the photo rule", () => {
    expect(joinSettingErrors({ ...settings, fields: { phone: "REQUIRED", state: "REQUIRED", minors: true } })).toEqual({ phone: ["Enter your phone number"], stateCode: ["Choose your state"] });
    expect(joinSettingErrors({ ...settings, minor: true })).toEqual({ guardianConsent: ["Your parent or guardian needs to agree"] });
    expect(joinSettingErrors({ ...settings, minor: true, guardianConsent: true })).toEqual({});
    expect(joinSettingErrors({ ...settings, photoMode: "OFF", photo, hasPhoto: true })).toEqual({ photo: ["This plan doesn't take a photo"] });
    expect(joinSettingErrors({ ...settings, photoMode: "REQUIRED" })).toEqual({ photo: ["Add a photo"] });
    expect(joinSettingErrors({ ...settings, photoMode: "REQUIRED", hasPhoto: true })).toEqual({});
  });
});

describe("keys used differently across plans", () => {
  it("lists keys whose shape or admin-only setting disagree", () => {
    const plans = [
      { fields: [field("shared"), field("size", { type: "SELECT", options: ["S", "M"] }), field("notes")] },
      { fields: [field("shared"), field("size", { type: "SELECT", options: ["M", "S"] }), field("notes", { adminOnly: true })] },
    ];
    expect(conflictingKeys(plans)).toEqual(["notes", "size"]);
    expect(conflictingKeys([plans[0]])).toEqual([]);
  });
});
