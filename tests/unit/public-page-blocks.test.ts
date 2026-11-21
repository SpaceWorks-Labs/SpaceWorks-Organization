import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ assets: 0 }));
vi.mock("@/lib/db", () => ({ prisma: { asset: { count: vi.fn(async () => mocks.assets) } } }));

import { areaJoinHref, areasForSection, applyAreaContext, type AreaEntry } from "@/lib/publicPage/blockData";
import { newSection, newSectionId, pageDocumentSchema, readPageDocument, SECTION_TYPES, sectionSchema, starterDocument } from "@/lib/publicPage/sections";
import { actionHref } from "@/lib/publicPage/live";
import { validatePageDocument } from "@/lib/publicPage/server";
import { templateDocument } from "@/lib/publicPage/templates";
import { templateForPath } from "@/lib/telemetry/routes";

const ORG = "org_a";
const key = (id = "11111111-1111-4111-8111-111111111111", org = ORG) => `organisations/${org}/page-images/${id}.webp`;
const doc = (sections: unknown[]): unknown => ({ tagline: "", coverAssetKey: null, accentColor: null, sections });
const base = (type: string, extra: Record<string, unknown> = {}) => ({ id: newSectionId(), visible: true, title: "", type, ...extra });

describe("new block schemas", () => {
  it("accepts every section type's starting content", () => {
    for (const type of SECTION_TYPES) expect(sectionSchema.safeParse(newSection(type)).success, type).toBe(true);
  });

  it("parses every template, including the members area preview", () => {
    const org = { name: "Club", description: "", contactEmail: null, contactPhone: null };
    const result = templateDocument("club", starterDocument(org), org);
    expect(pageDocumentSchema.safeParse(result).success).toBe(true);
    expect(result.sections.some((section) => section.type === "membersPreview")).toBe(true);
  });

  it("leaves old documents unchanged", () => {
    const old = doc([base("about", { markdown: "Hello" }), base("counts", { total: true }), base("gallery", { images: [{ key: key(), alt: "x" }] })]);
    expect(readPageDocument(old).sections.map((section) => section.type)).toEqual(["about", "counts", "gallery"]);
    expect(pageDocumentSchema.safeParse(old).success).toBe(true);
  });

  it("needs a grouping for a grouping metric and drops it when read leniently", () => {
    const bad = doc([base("liveStats", { metrics: [{ kind: "byGrouping" }] }), base("text", { body: "kept" })]);
    expect(pageDocumentSchema.safeParse(bad).success).toBe(false);
    expect(readPageDocument(bad).sections.map((section) => section.type)).toEqual(["text"]);
    expect(pageDocumentSchema.safeParse(doc([base("liveStats", { metrics: [{ kind: "byGrouping", groupingId: "abc123" }] })])).success).toBe(true);
  });

  it("rejects unsafe links and unknown icons", () => {
    const button = (url: string) => base("buttons", { items: [{ kind: "link", label: "Go", url }] });
    expect(sectionSchema.safeParse(button("https://example.org")).success).toBe(true);
    expect(sectionSchema.safeParse(button("javascript:alert(1)")).success).toBe(false);
    expect(sectionSchema.safeParse(base("badges", { items: [{ label: "A", url: "data:text/html,x" }] })).success).toBe(false);
    expect(sectionSchema.safeParse(base("iconList", { items: [{ icon: "not-an-icon", title: "T" }] })).success).toBe(false);
    expect(sectionSchema.safeParse(base("iconList", { items: [{ icon: "check", title: "T" }] })).success).toBe(true);
  });

  it("keeps columns to 2 to 4 and the areas code tidy", () => {
    expect(sectionSchema.safeParse(base("columns", { columns: [{ items: [] }] })).success).toBe(false);
    expect(sectionSchema.safeParse(base("columns", { columns: Array.from({ length: 5 }, () => ({ items: [] })) })).success).toBe(false);
    expect(sectionSchema.safeParse(base("areas", { parentCode: "no way!" })).success).toBe(false);
    const parsed = sectionSchema.parse(base("areas", { parentCode: "north" }));
    expect(parsed.type === "areas" && parsed.parentCode).toBe("NORTH");
  });

  it("rejects another organisation's or a missing image inside columns", async () => {
    const column = (imageKey: string) => doc([base("columns", { columns: [{ items: [{ type: "image", imageKey, alt: "" }] }, { items: [] }] })]);
    mocks.assets = 1;
    expect((await validatePageDocument(ORG, column(key()))).ok).toBe(true);
    expect((await validatePageDocument(ORG, column(key(undefined, "org_b")))).ok).toBe(false);
    mocks.assets = 0;
    expect((await validatePageDocument(ORG, column(key()))).ok).toBe(false);
  });

  it("refuses a document over the size cap", async () => {
    const big = doc(Array.from({ length: 30 }, () => base("about", { markdown: "x".repeat(6000) })));
    const result = await validatePageDocument(ORG, big);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too large/);
  });
});

const entry = (id: string, code: string, level: number, path: string, joinPlans: string[] = ["open"]): AreaEntry => ({ id, code, name: code, level, levelLabel: "", parentId: null, path, contact: { email: null, phone: null, website: null }, joinPlans, pageHref: `/o/x/a/${code}` });
const tree = [entry("a", "A", 0, "a"), entry("b", "B", 0, "b"), entry("a1", "A1", 1, "a/a1"), entry("a2", "A2", 1, "a/a2"), entry("a1x", "A1X", 2, "a/a1/a1x")];

describe("areas directory helpers", () => {
  const section = (parentCode: string, scope: "level" | "subtree") => ({ parentCode, scope });
  it("lists the top level, one level below an area, or a whole subtree", () => {
    expect(areasForSection(section("", "level"), tree, null).map((a) => a.code)).toEqual(["A", "B"]);
    expect(areasForSection(section("A", "level"), tree, null).map((a) => a.code)).toEqual(["A1", "A2"]);
    expect(areasForSection(section("A", "subtree"), tree, null).map((a) => a.code)).toEqual(["A1", "A2", "A1X"]);
    expect(areasForSection(section("NOPE", "level"), tree, null)).toEqual([]);
  });
  it("on an area page lists that area's own sub-areas", () => {
    expect(areasForSection(section("", "level"), tree, { id: "a1" }).map((a) => a.code)).toEqual(["A1X"]);
  });
  it("builds join links with the area code, or none without an open plan", () => {
    expect(areaJoinHref(tree[0]!, { joinPlanSlug: "" }, "club")).toBe("/o/club/join/open?unit=A");
    expect(areaJoinHref({ code: "A", joinPlans: ["open", "student"] }, { joinPlanSlug: "student" }, "club")).toBe("/o/club/join/student?unit=A");
    expect(areaJoinHref({ code: "A", joinPlans: [] }, { joinPlanSlug: "" }, "club")).toBeNull();
  });
});

describe("area context", () => {
  it("overrides contact blocks only with what an area sets", () => {
    const document = readPageDocument(doc([base("contact", { email: "org@example.org", phone: "+91 99999 11111" })]));
    const next = applyAreaContext(document, { ownContact: { email: "north@example.org", phone: null, website: null } });
    const contact = next.sections[0]!;
    expect(contact.type === "contact" && [contact.email, contact.phone]).toEqual(["north@example.org", "+91 99999 11111"]);
    expect(applyAreaContext(document, null)).toBe(document);
  });
  it("carries the area code on join buttons", () => {
    const action = { kind: "join" as const, label: "Join", planSlug: "open", url: "" };
    const context = { orgSlug: "club", plans: [{ slug: "open", joinMode: "OPEN" }], takingMembers: true, plansSectionId: null };
    expect(actionHref(action, context)?.href).toBe("/o/club/join/open");
    expect(actionHref(action, { ...context, areaCode: "NORTH" })?.href).toBe("/o/club/join/open?unit=NORTH");
  });
  it("lets analytics report the area route template only", () => {
    expect(templateForPath("/o/club/a/NORTH")).toBe("/o/:orgSlug/a/:unitCode");
    expect(templateForPath("/o/club/a")).toBeNull();
  });
});
