import { describe, expect, it } from "vitest";
import { defaultCardDesign } from "@/lib/cards/design/presets";
import { draftDiffers, readDraft } from "@/lib/cards/draft";
import { can } from "@/lib/permissionRoles";

const context = { organisationName: "Space Works Kochi", planName: "" };
const live = { design: defaultCardDesign(context, "night"), draft: null, numberPrefix: "SWK", numberFormat: "{PREFIX}-{SEQ:4}", watermarkUrl: null };

describe("card design drafts", () => {
  it("only the owner approves designs; managers draft them", () => {
    expect(can("OWNER", "cards.approve")).toBe(true);
    for (const role of ["ADMIN", "TREASURER", "VIEWER"] as const) expect(can(role, "cards.approve")).toBe(false);
    expect(can("ADMIN", "org.settings")).toBe(true);
  });

  it("edits the live design when there is no draft, and nothing is waiting", () => {
    expect(readDraft(live, context)).toMatchObject({ design: { preset: "night" }, numberPrefix: "SWK" });
    expect(draftDiffers(live, context)).toBe(false);
  });

  it("reads the draft over the live design, and checks every value again", () => {
    const row = { ...live, draft: { design: defaultCardDesign(context, "student"), numberPrefix: "bad prefix!", numberFormat: "{PREFIX}-{MEMBER}", watermarkUrl: null } };
    expect(readDraft(row, context)).toMatchObject({ design: { preset: "student" }, numberPrefix: "SWK", numberFormat: "{PREFIX}-{SEQ:4}", watermarkUrl: null });
    expect(draftDiffers(row, context)).toBe(true);
  });

  it("a draft equal to the live design is nothing to approve; a never-approved design always is", () => {
    expect(draftDiffers({ ...live, draft: { design: live.design, numberPrefix: "SWK", numberFormat: "{PREFIX}-{SEQ:4}", watermarkUrl: null } }, context)).toBe(false);
    expect(draftDiffers({ ...live, design: null, draft: { design: live.design } }, context)).toBe(true);
  });
});
