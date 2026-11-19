import { describe, expect, it } from "vitest";
import { entryTarget, isLandingEnabled } from "@/lib/features/landing";

const orgs = (...slugs: string[]) => async () => ({ total: slugs.length, organisations: slugs.map((slug) => ({ slug })) });

describe("LANDING_ENABLED", () => {
  it("is on unless set to an off word", () => {
    for (const value of [undefined, "", "true", "1", "on", "yes", "anything"]) expect(isLandingEnabled(value)).toBe(true);
    for (const value of ["false", "0", "off", "no", " FALSE ", "Off"]) expect(isLandingEnabled(value)).toBe(false);
  });
});

describe("entry point when the landing page is off (product rules §12.2)", () => {
  it("opens the only public organisation directly", async () => {
    expect(await entryTarget(orgs("riverside-cycling"))).toBe("/o/riverside-cycling");
  });

  it("lists several public organisations", async () => {
    expect(await entryTarget(orgs("a", "b"))).toBe("/organisations");
    // The directory reader returns one page; the total decides.
    expect(await entryTarget(async () => ({ total: 30, organisations: [{ slug: "a" }] }))).toBe("/organisations");
  });

  it("opens sign-in when there are none", async () => {
    expect(await entryTarget(orgs())).toBe("/login");
  });

  it("opens sign-in when the lookup fails", async () => {
    expect(await entryTarget(async () => { throw new Error("database unavailable"); })).toBe("/login");
  });

  it("encodes the slug", async () => {
    expect(await entryTarget(orgs("a b"))).toBe("/o/a%20b");
  });
});
