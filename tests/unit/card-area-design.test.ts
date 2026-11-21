import { describe, expect, it } from "vitest";
import { nearestAreaDesign } from "@/lib/cards/areaDesigns";
import { cardUnit, designFor, holderFor, organisationDesignRow, type CardOrgContext } from "@/lib/cards/data";
import { defaultCardDesign } from "@/lib/cards/design/presets";

const NAMES = { organisationName: "Example Network", planName: "" };
const north = { id: "n", name: "North", code: "N", level: 0, path: "n" };
const north1 = { id: "n1", name: "North 1", code: "N1", level: 1, path: "n/n1" };
const south = { id: "s", name: "South", code: "S", level: 0, path: "s" };

function row(extra: { planId?: string; roleId?: string; unitId?: string }, preset: "night" | "student" | "corporate" | "community") {
  return { planId: null, roleId: null, unitId: null, ...extra, design: defaultCardDesign(NAMES, preset), watermarkUrl: null, numberPrefix: "EXN", numberFormat: "{PREFIX}-{SEQ:4}" };
}

function context(designs: CardOrgContext["designs"], extra: Partial<CardOrgContext["organisation"]> = {}): CardOrgContext {
  return {
    organisation: { id: "org", name: "Example Network", slug: "example", logoUrl: null, accentColor: null, timezone: "UTC", status: "ACTIVE", unitLevels: ["Area", "Unit"], delightEnabled: true, ...extra },
    designs,
    fields: new Map(),
    units: new Map(),
  };
}

const plan = { id: "p", name: "Annual" };

describe("area designs", () => {
  it("finds the member's own unit's design, else the nearest unit above", () => {
    const rows = [{ unitId: "n", tag: "north" }, { unitId: "n1", tag: "north 1" }, { unitId: null, tag: "organisation" }];
    expect(nearestAreaDesign(rows, "n/n1")?.tag).toBe("north 1");
    expect(nearestAreaDesign(rows.slice(0, 1), "n/n1")?.tag).toBe("north");
    expect(nearestAreaDesign(rows, "s")).toBeUndefined();
    expect(nearestAreaDesign(rows, null)).toBeUndefined();
  });

  it("picks the design in order: role, then area, then plan, then organisation, then built-in", () => {
    const all = context([row({}, "community"), row({ planId: "p" }, "corporate"), row({ unitId: "n" }, "student"), row({ roleId: "r" }, "night")]);
    expect(designFor(all, plan, "r", north1)).toMatchObject({ source: "role", design: { preset: "night" } });
    expect(designFor(all, plan, null, north1)).toMatchObject({ source: "area", design: { preset: "student" } });
    expect(designFor(all, plan, null, south)).toMatchObject({ source: "plan", design: { preset: "corporate" } });
    expect(designFor(all, { id: "other", name: "Other" }, null, south)).toMatchObject({ source: "organisation", design: { preset: "community" } });
    expect(designFor(context([]), plan, null, north)).toMatchObject({ source: "default" });
  });

  it("lets the nearest area win over a higher one", () => {
    const both = context([row({ unitId: "n" }, "student"), row({ unitId: "n1" }, "night")]);
    expect(designFor(both, plan, null, north1).design.preset).toBe("night");
    expect(designFor(both, plan, null, north).design.preset).toBe("student");
  });

  it("never treats an area design as the organisation default", () => {
    const only = context([row({ unitId: "n" }, "student")]);
    expect(organisationDesignRow(only)).toBeUndefined();
    expect(designFor(only, plan, null, south).source).toBe("default");
    // Members with no unit never get an area design.
    expect(designFor(only, plan, null, null).source).toBe("default");
  });

  it("only sees live rows: with no live area row (a draft is never loaded) it falls through", () => {
    const live = context([row({}, "community")]);
    expect(designFor(live, plan, null, north1)).toMatchObject({ source: "organisation" });
  });
});

describe("area contact on the card back", () => {
  const card = (unit: Record<string, unknown> | null) =>
    ({
      memberId: "m",
      verifyToken: "t".repeat(43),
      planId: "p",
      cardNumber: "EXN-0001",
      plan: { id: "p", name: "Annual" },
      member: { id: "m", organisationId: "org", name: "Asha Menon", photoUrl: null, fieldValues: {}, anonymisedAt: null, unit, user: null, roles: [], terms: [] },
    }) as unknown as Parameters<typeof holderFor>[0];

  const orgContact = { website: "https://example.org", contactEmail: "hello@example.org", contactPhone: "+91 484 000 0000" };

  it("prints the organisation's contact for a member with no area details", () => {
    const ctx = context([], orgContact);
    const holder = holderFor(card(north1), ctx);
    expect(holder.contact).toEqual({ website: "example.org", email: "hello@example.org", phone: "+91 484 000 0000" });
    expect(holderFor(card(null), ctx).contact?.email).toBe("hello@example.org");
  });

  it("takes each detail from the nearest unit that sets it, else the organisation", () => {
    const ctx = context([], orgContact);
    ctx.units.set("n", { ...north, contactEmail: "north@example.org", website: "https://north.example.org/" });
    const unit = { ...north1, contactPhone: "98765 43210" };
    expect(cardUnit(card(unit))).toBe(unit);
    expect(holderFor(card(unit), ctx).contact).toEqual({ website: "north.example.org", email: "north@example.org", phone: "98765 43210" });
  });
});
