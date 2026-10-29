import { describe, expect, it } from "vitest";
import { fillLayerText } from "@/lib/cards/design/layers";
import { normalizeCardDesign } from "@/lib/cards/design/presets";
import { applyCardTemplate, CARD_TEMPLATE_INFO, cardTemplateDesign } from "@/lib/cards/design/templates";
import { defaultCardDesign } from "@/lib/cards/design/presets";
import { CARD_NUMBER_MAX_LENGTH, formatCardNumberFrom, formatUsesUnits, longestNumber, numberFormatError } from "@/lib/cards/numbering";
import { roleCardRows } from "@/lib/cards/roleCards";
import { missingAncestorIds, unitChain, type CardUnitRow } from "@/lib/cards/units";

const parts = { prefix: "EXN", seq: 42, memberNumber: 7, year: 2026 };
const north: CardUnitRow = { id: "u-north", name: "North", code: "N", level: 0, path: "u-north" };
const north1: CardUnitRow = { id: "u-north1", name: "North 1", code: "N1", level: 1, path: "u-north/u-north1" };
const known = new Map([[north.id, north]]);

describe("unit tokens in card numbers", () => {
  it("prints the member's own unit code and the code at each level, top first", () => {
    const units = { unitCode: "N1", unitCodes: ["N", "N1"] };
    expect(formatCardNumberFrom("{PREFIX}-{UNIT}-{SEQ:4}", { ...parts, ...units })).toBe("EXN-N1-0042");
    expect(formatCardNumberFrom("{U1}/{U2}/{SEQ}", { ...parts, ...units })).toBe("N/N1/42");
  });

  it("prints NA for a member without a unit, or without one at that level", () => {
    expect(formatCardNumberFrom("{UNIT}-{U1}-{SEQ}", parts)).toBe("NA-NA-42");
    expect(formatCardNumberFrom("{U1}-{U2}-{U3}-{SEQ}", { ...parts, unitCode: "N", unitCodes: ["N"] })).toBe("N-NA-NA-42");
    expect(formatCardNumberFrom("{U2}-{SEQ}", { ...parts, unitCode: "N", unitCodes: ["N", null] })).toBe("NA-42");
  });

  it("accepts the unit tokens, in any case, and tells when a pattern uses them", () => {
    expect(numberFormatError("{PREFIX}-{U1}-{UNIT}-{SEQ:4}")).toBeNull();
    expect(numberFormatError("{u4}{unit}{seq}")).toBeNull();
    expect(formatUsesUnits("{PREFIX}-{U2}-{SEQ}")).toBe(true);
    expect(formatUsesUnits("{UNIT}{SEQ}")).toBe(true);
    expect(formatUsesUnits("{PREFIX}-{SEQ}")).toBe(false);
  });

  it("refuses a length on a unit token and levels past the fourth", () => {
    expect(numberFormatError("{UNIT:3}-{SEQ}")).toMatch(/Only \{SEQ\} and \{MEMBER\} take a length/);
    expect(numberFormatError("{U2:3}-{SEQ}")).toMatch(/take a length/);
    expect(numberFormatError("{U5}-{SEQ}")).toBe("Unit levels go from {U1}, the top level, to {U4}.");
    expect(numberFormatError("{U0}-{SEQ}")).toMatch(/\{U1\}/);
  });

  it("counts each unit token as six characters towards the longest number", () => {
    expect(longestNumber("{UNIT}")).toBe(6);
    expect(longestNumber("{U1}-{U2}-{SEQ}")).toBe(6 + 1 + 6 + 1 + 7);
    // 6 + 6×4 + 7 = 37: past 32, so the pattern is refused.
    expect(longestNumber("{UNIT}{U1}{U2}{U3}{U4}{SEQ}")).toBeGreaterThan(CARD_NUMBER_MAX_LENGTH);
    expect(numberFormatError("{UNIT}{U1}{U2}{U3}{U4}{SEQ}")).toMatch(/32 characters/);
    expect(numberFormatError("{PREFIX}-{U1}-{U2}-{SEQ:4}")).toBeNull();
  });
});

describe("unit chains", () => {
  it("builds the chain top first with the organisation's level names", () => {
    expect(unitChain(north1, known, ["Area", "Unit"])).toEqual([
      { level: 0, levelName: "Area", name: "North", code: "N" },
      { level: 1, levelName: "Unit", name: "North 1", code: "N1" },
    ]);
    expect(unitChain(north, known, [])).toEqual([{ level: 0, levelName: "Unit", name: "North", code: "N" }]);
    expect(unitChain(null, known, ["Area"])).toEqual([]);
  });

  it("leaves out an ancestor it hasn't loaded rather than guess", () => {
    expect(unitChain(north1, new Map(), ["Area", "Unit"]).map((unit) => unit.name)).toEqual(["North 1"]);
  });

  it("asks only for ancestors not yet loaded, once each", () => {
    const sibling = { ...north1, id: "u-north2", path: "u-north/u-north2" };
    expect(missingAncestorIds([north1, sibling], known)).toEqual(["u-north1", "u-north2"]);
    expect(missingAncestorIds([north1], new Map([[north.id, north], [north1.id, north1]]))).toEqual([]);
  });
});

describe("unit placeholders on card text", () => {
  const holder = { displayName: "Asha Menon", role: null, planName: null, idNumber: null, validUntil: null, units: unitChain(north1, known, ["Area", "Unit"]) };

  it("fills the member's unit, its code, the whole chain and each level", () => {
    expect(fillLayerText("{level1} > {level2} ({unitCode}) · {unit} · {units} · {level3}.", holder)).toBe("North > North 1 (N1) · North 1 · North · North 1 · .");
  });

  it("prints nothing for a member without a unit", () => {
    expect(fillLayerText("[{unit}{unitCode}{units}{level1}]", { ...holder, units: undefined })).toBe("[]");
  });
});

describe("standard card templates", () => {
  const context = { organisationName: "Example Network", planName: "Annual member" };

  it.each(["standard-portrait", "standard-landscape"] as const)("%s survives the design schema unchanged", (id) => {
    const design = cardTemplateDesign(id, context);
    expect(normalizeCardDesign(JSON.parse(JSON.stringify(design)), context)).toEqual(design);
    expect(design.front.widthMm > design.front.heightMm).toBe(id === "standard-landscape");
    const front = design.front;
    expect([front.showPhoto, front.showName, front.showRole, front.showPlan, front.showIdNumber, front.showValidUntil, front.showQr]).toEqual([true, true, true, true, true, true, true]);
    expect(front.layers).toEqual([expect.objectContaining({ kind: "text", text: "{units}" })]);
    expect(front.order.at(-1)).toBe("lstdunits");
    expect(CARD_TEMPLATE_INFO[id].label).toMatch(/^Standard/);
  });

  it("keeps the units line clear of the plan line below it", () => {
    for (const id of ["standard-portrait", "standard-landscape"] as const) {
      const front = cardTemplateDesign(id, context).front;
      const units = front.layers[0]!;
      expect(units.yMm + units.hMm).toBeLessThanOrEqual(front.elementPositions.plan.yMm);
      expect(front.elementPositions.role.yMm).toBeLessThan(units.yMm);
    }
  });

  it("applies over an existing design, keeping its printed answers and back setting", () => {
    const existing = { ...defaultCardDesign(context, "night"), backEnabled: false };
    existing.front = { ...existing.front, printFieldKeys: ["blood"] };
    const applied = applyCardTemplate(existing, "standard-portrait", context);
    expect(applied.backEnabled).toBe(false);
    expect(applied.front.printFieldKeys).toEqual(["blood"]);
    expect(applied.front.layers.map((layer) => layer.id)).toEqual(["lstdunits"]);
  });
});

describe("role cards", () => {
  const roles = [{ id: "r-head", name: "Area head" }, { id: "r-sec", name: "Unit secretary" }, { id: "r-life", name: "Life member" }, { id: "r-new", name: "New role" }];
  const designs = [
    { roleId: "r-head", live: true, hasDraft: false, numberFormat: "{PREFIX}-{U1}-{SEQ}" },
    { roleId: "r-sec", live: true, hasDraft: true, numberFormat: "{PREFIX}-{SEQ}" },
    { roleId: "r-life", live: false, hasDraft: true, numberFormat: "{PREFIX}-{SEQ}" },
    { roleId: null, live: true, hasDraft: false, numberFormat: "{PREFIX}-{SEQ:4}" },
  ];

  it("lists every role with its design status, own pattern and live card count", () => {
    expect(roleCardRows(roles, designs, new Map([["r-head", 3], ["r-life", 2]]))).toEqual([
      { roleId: "r-head", name: "Area head", ownDesign: true, status: "approved", numberFormat: "{PREFIX}-{U1}-{SEQ}", liveCards: 3 },
      { roleId: "r-sec", name: "Unit secretary", ownDesign: true, status: "changes", numberFormat: "{PREFIX}-{SEQ}", liveCards: 0 },
      { roleId: "r-life", name: "Life member", ownDesign: false, status: "draft", numberFormat: null, liveCards: 2 },
      { roleId: "r-new", name: "New role", ownDesign: false, status: "organisation", numberFormat: null, liveCards: 0 },
    ]);
  });
});
