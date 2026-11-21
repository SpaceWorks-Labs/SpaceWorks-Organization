import { describe, expect, it } from "vitest";
import { contactFor, unitChainNearestFirst } from "@/lib/units/contact";
import { checkUnitContact } from "@/lib/units/contactInput";

const organisation = { contactEmail: "hello@example.org", contactPhone: "+91 484 000 0000", website: "https://example.org" };
const empty = { contactEmail: "", contactPhone: "", website: "" };

describe("area contact details", () => {
  it("uses the organisation's details when no unit sets any", () => {
    expect(contactFor([], organisation)).toEqual({ email: "hello@example.org", phone: "+91 484 000 0000", website: "https://example.org" });
    expect(contactFor([{}, { contactEmail: "  " }], organisation).email).toBe("hello@example.org");
  });

  it("takes each detail from the nearest unit that sets it", () => {
    const own = { contactPhone: "98765 43210" };
    const parent = { contactEmail: "north@example.org", contactPhone: "11111 11111", website: "https://north.example.org" };
    expect(contactFor([own, parent], organisation)).toEqual({ email: "north@example.org", phone: "98765 43210", website: "https://north.example.org" });
  });

  it("returns null for a detail nobody sets", () => {
    expect(contactFor([], {})).toEqual({ email: null, phone: null, website: null });
  });

  it("orders a unit and its ancestors nearest first and skips unknown ids", () => {
    const units = [{ id: "a", path: "a" }, { id: "b", path: "a/b" }, { id: "c", path: "a/b/c" }];
    expect(unitChainNearestFirst({ path: "a/b/c" }, units).map((unit) => unit.id)).toEqual(["c", "b", "a"]);
    expect(unitChainNearestFirst({ path: "a/x/c" }, units).map((unit) => unit.id)).toEqual(["c", "a"]);
    expect(unitChainNearestFirst(null, units)).toEqual([]);
  });
});

describe("checking an area's contact details", () => {
  it("clears empty details to null and trims the rest", () => {
    expect(checkUnitContact(empty)).toEqual({ ok: true, values: { contactEmail: null, contactPhone: null, website: null } });
    expect(checkUnitContact({ contactEmail: " North@Example.org ", contactPhone: " +91 (484) 123-4567 ", website: " https://north.example.org/area " })).toEqual({
      ok: true,
      values: { contactEmail: "north@example.org", contactPhone: "+91 (484) 123-4567", website: "https://north.example.org/area" },
    });
  });

  it("refuses a badly shaped email, a phone with letters or the wrong length, and a website that is not http(s)", () => {
    for (const email of ["north", "a@b", "a b@c.org"]) expect(checkUnitContact({ ...empty, contactEmail: email })).toMatchObject({ ok: false, errors: { contactEmail: expect.any(String) } });
    for (const phone of ["12345", "call me now", "1".repeat(21), "++--  "]) expect(checkUnitContact({ ...empty, contactPhone: phone })).toMatchObject({ ok: false, errors: { contactPhone: expect.any(String) } });
    for (const website of ["example.org", "javascript:alert(1)", "mailto:a@b.org", "ftp://example.org", "https://"]) expect(checkUnitContact({ ...empty, website })).toMatchObject({ ok: false, errors: { website: expect.any(String) } });
  });

  it("reports every failing field at once", () => {
    const result = checkUnitContact({ contactEmail: "x", contactPhone: "y", website: "z" });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["contactEmail", "contactPhone", "website"]);
  });
});
