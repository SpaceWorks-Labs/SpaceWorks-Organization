import { describe, expect, it } from "vitest";
import { pathWithin, planOffersUnit } from "@/lib/membership/planUnits";

describe("pathWithin", () => {
  it("matches the path itself and anything under it", () => {
    expect(pathWithin("north", "north")).toBe(true);
    expect(pathWithin("north/kollam", "north")).toBe(true);
    expect(pathWithin("north/kollam/beach", "north")).toBe(true);
  });

  it("never matches a sibling that shares a prefix, or an ancestor", () => {
    expect(pathWithin("northeast", "north")).toBe(false);
    expect(pathWithin("northeast/kollam", "north")).toBe(false);
    expect(pathWithin("north", "north/kollam")).toBe(false);
  });
});

describe("planOffersUnit", () => {
  it("offers a plan open to every unit everywhere", () => {
    expect(planOffersUnit({ allUnits: true }, [], "south/varkala")).toBe(true);
  });

  it("offers a limited plan to its units and their whole subtree", () => {
    const paths = ["north", "south/varkala"];
    expect(planOffersUnit({ allUnits: false }, paths, "north")).toBe(true);
    expect(planOffersUnit({ allUnits: false }, paths, "north/kollam")).toBe(true);
    expect(planOffersUnit({ allUnits: false }, paths, "south/varkala")).toBe(true);
  });

  it("refuses units outside every listed subtree", () => {
    const paths = ["north", "south/varkala"];
    expect(planOffersUnit({ allUnits: false }, paths, "south")).toBe(false);
    expect(planOffersUnit({ allUnits: false }, paths, "south/kovalam")).toBe(false);
    expect(planOffersUnit({ allUnits: false }, paths, "northeast")).toBe(false);
    expect(planOffersUnit({ allUnits: false }, [], "north")).toBe(false);
  });
});
