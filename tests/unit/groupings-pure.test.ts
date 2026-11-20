import { describe, expect, it } from "vitest";
import { decodeValueIds, encodeValueIds, firstFreeKey, firstFreeValueCode, flattenValues, groupingKeyBase, indentedLabel, normaliseValueCode, valueCodeBase, VALUE_CODE_PATTERN } from "@/lib/groupings/keys";
import { resolveImportGroupings, type GroupingLookup } from "@/lib/groupings/importValues";
import { suggestMapping, readRow, mappingIsUsable } from "@/lib/membership/importMapping";

describe("grouping keys and codes", () => {
  it("make a safe key from a name and number repeats", () => {
    expect(groupingKeyBase("Profession")).toBe("profession");
    expect(groupingKeyBase("  Area of interest! ")).toBe("area_of_interest");
    expect(groupingKeyBase("2026 cohort")).toBe("g_2026_cohort");
    expect(groupingKeyBase("!!!")).toBe("grouping");
    expect(firstFreeKey("profession", new Set(["profession", "profession_2"]))).toBe("profession_3");
  });

  it("make codes of 1 to 12 letters and digits, shortened to fit a number", () => {
    expect(valueCodeBase("Cardiology & Heart")).toBe("CARDIOLOGYHE");
    expect(valueCodeBase("---")).toBe("V");
    expect(normaliseValueCode("ab-12")).toBe("AB12");
    expect(VALUE_CODE_PATTERN.test(firstFreeValueCode("CARDIOLOGYHE", new Set(["CARDIOLOGYHE"])))).toBe(true);
    expect(firstFreeValueCode("DOCTORS", new Set(["DOCTORS", "DOCTORS2"]))).toBe("DOCTORS3");
  });

  it("carry several value ids in one answer and drop repeats", () => {
    expect(decodeValueIds("a; b;a;")).toEqual(["a", "b"]);
    expect(decodeValueIds(["x", "x", 3])).toEqual(["x"]);
    expect(decodeValueIds(undefined)).toEqual([]);
    expect(decodeValueIds(encodeValueIds(["a", "b"]))).toEqual(["a", "b"]);
  });
});

describe("value trees", () => {
  const values = [
    { id: "kerala", parentId: "india", label: "Kerala", code: "KL", sortOrder: 0 },
    { id: "asia", parentId: null, label: "Asia", code: "AS", sortOrder: 0 },
    { id: "india", parentId: "asia", label: "India", code: "IN", sortOrder: 0 },
    { id: "europe", parentId: null, label: "Europe", code: "EU", sortOrder: 1 },
    { id: "orphan", parentId: "gone", label: "Orphan", code: "OR", sortOrder: 2 },
  ];

  it("lists parents before children with their depth, siblings by order", () => {
    expect(flattenValues(values).map((value) => [value.id, value.level])).toEqual([["asia", 0], ["india", 1], ["kerala", 2], ["europe", 0], ["orphan", 0]]);
    expect(indentedLabel("India", 1)).toBe("— India");
  });
});

describe("matching imported grouping cells", () => {
  const lookup: GroupingLookup = new Map([
    ["profession", { id: "g1", name: "Profession", multiple: false, values: [{ id: "v1", label: "Doctors", code: "DOC" }, { id: "v2", label: "Engineers", code: "ENG" }] }],
    ["interests", { id: "g2", name: "Interests", multiple: true, values: [{ id: "v3", label: "Chess", code: "CHESS" }, { id: "v4", label: "Go", code: "GO" }] }],
  ]);

  it("matches by label or code in any case and accepts several only where allowed", () => {
    expect(resolveImportGroupings(lookup, { profession: "doctors" })).toEqual({ groupings: [{ groupingId: "g1", valueIds: ["v1"] }] });
    expect(resolveImportGroupings(lookup, { profession: "ENG" })).toEqual({ groupings: [{ groupingId: "g1", valueIds: ["v2"] }] });
    expect(resolveImportGroupings(lookup, { interests: "chess; GO" })).toEqual({ groupings: [{ groupingId: "g2", valueIds: ["v3", "v4"] }] });
    expect(resolveImportGroupings(lookup, { profession: "Doctors; Engineers" })).toEqual({ error: "Profession takes one value" });
    expect(resolveImportGroupings(lookup, { profession: "Plumbers" })).toEqual({ error: 'No Profession value called "Plumbers"' });
    expect(resolveImportGroupings(lookup, { missing: "x" })).toMatchObject({ error: expect.stringContaining("No grouping") });
    expect(resolveImportGroupings(undefined, {})).toEqual({ groupings: [] });
  });

  it("suggest and read grouping columns", () => {
    const mapping = suggestMapping(["Name", "Email", "Profession"], [], [{ key: "profession", name: "Profession" }]);
    expect(mapping).toEqual(["name", "email", "grouping:profession"]);
    expect(readRow(["Dina", "dina@example.test", " Doctors "], mapping)).toMatchObject({ groupings: { profession: "Doctors" } });
    expect(mappingIsUsable(mapping, undefined, new Set(["profession"]))).toBeNull();
    expect(mappingIsUsable(mapping, undefined, new Set(["other"]))).toMatch(/groupings/);
  });
});
