import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DOCS_SLUGS, FEATURE_AREAS, featureArea } from "@/lib/features/catalog";
import { CAPABILITY_LIST } from "@/lib/permissionRoles";

const EXPECTED = [
  "organisations", "units", "groupings", "staff-and-roles", "sign-in", "plans-and-join-forms", "renewals", "payments", "receipts-and-refunds",
  "member-cards", "member-portal", "public-page", "reports-and-analytics", "notifications", "web-analytics", "self-hosting",
];

describe("feature catalogue", () => {
  it("lists exactly the sixteen areas, in docs order, each once", () => {
    expect([...DOCS_SLUGS]).toEqual(EXPECTED);
    expect(FEATURE_AREAS.map((area) => area.id)).toEqual(EXPECTED);
    expect(new Set(FEATURE_AREAS.map((area) => area.id)).size).toBe(FEATURE_AREAS.length);
  });

  it("links every area to its own docs page", () => {
    for (const area of FEATURE_AREAS) {
      expect(DOCS_SLUGS).toContain(area.docsSlug);
      expect(area.docsSlug).toBe(area.id);
    }
    expect(new Set(FEATURE_AREAS.map((area) => area.docsSlug)).size).toBe(FEATURE_AREAS.length);
  });

  it("says what each area does, who can use it and how to switch it on or off", () => {
    for (const area of FEATURE_AREAS) {
      expect(area.title.trim()).not.toBe("");
      expect(area.summary.trim()).not.toBe("");
      expect(area.does.length).toBeGreaterThan(0);
      expect(area.who.length).toBeGreaterThan(0);
      expect(area.toggle.length).toBeGreaterThan(0);
    }
  });

  it("names only permissions that exist", () => {
    const named = FEATURE_AREAS.flatMap((area) => [...area.does, ...area.who, ...area.toggle])
      .flatMap((text) => text.match(/\b[a-z]+\.[a-z0-9]+\b/g) ?? [])
      .filter((word) => /^(org|members|reports|payments|cards|audit|erasure|team|plans|structure|accounts|roles|ownership)\./.test(word));
    expect(named.length).toBeGreaterThan(0);
    for (const name of named) expect(CAPABILITY_LIST as readonly string[]).toContain(name);
  });

  it("keeps a feature doc for every slug that has one in docs/features", () => {
    const docs = readdirSync(join(import.meta.dirname, "../../docs/features")).filter((file) => file.endsWith(".md")).map((file) => file.replace(/\.md$/, ""));
    for (const slug of docs) expect(DOCS_SLUGS as readonly string[]).toContain(slug);
  });

  it("finds an area by id", () => {
    expect(featureArea("units")?.title).toBe("Units");
    expect(featureArea("events")).toBeUndefined();
  });
});
