import { describe, expect, it } from "vitest";
import { firstFreeUnitCode, unitCodeBase } from "@/lib/structure/units";

describe("unit codes", () => {
  it("takes the name's letters and digits, upper-cased, at most six", () => {
    expect(unitCodeBase("Kazhakkoottam")).toBe("KAZHAK");
    expect(unitCodeBase("Ward 12-B")).toBe("WARD12");
    expect(unitCodeBase("കൊല്ലം")).toBe("U");
  });

  it("shortens the base so a number still fits in six characters", () => {
    expect(firstFreeUnitCode("KLM", new Set())).toBe("KLM");
    expect(firstFreeUnitCode("KLM", new Set(["KLM"]))).toBe("KLM2");
    expect(firstFreeUnitCode("THIRUV", new Set(["THIRUV", "THIRU2"]))).toBe("THIRU3");
    const taken = new Set(["ABCDEF", ...Array.from({ length: 8 }, (_, i) => `ABCDE${i + 2}`)]);
    expect(firstFreeUnitCode("ABCDEF", taken)).toBe("ABCD10");
  });
});
