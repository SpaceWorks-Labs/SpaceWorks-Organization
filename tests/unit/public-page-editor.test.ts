// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { newSection, SECTION_TYPES, type PageDocument, type PageSection } from "@/lib/publicPage/sections";
import { BLOCK_CATEGORIES, BLOCK_CATEGORY, BLOCK_PREVIEWS, blocksFor } from "@/components/settings/public-page/editor/blockCatalog";
import { errorsForSection, getIn, insertSectionAfter, moveSectionTo, removeSection, replaceSection, sectionsWithErrors, setIn } from "@/components/settings/public-page/editor/documentOps";
import { inlineFields, pickInlineField } from "@/components/settings/public-page/editor/inlineFields";

const doc = (sections: PageSection[]): PageDocument => ({ tagline: "", coverAssetKey: null, accentColor: null, sections });
const three = () => doc([newSection("about", "aaaaaa1"), newSection("plans", "bbbbbb1"), newSection("contact", "cccccc1")]);
const ids = (document: PageDocument) => document.sections.map((section) => section.id);

describe("public page editor: document changes", () => {
  it("inserts after the selected section, or at the end", () => {
    const added = newSection("divider", "dddddd1");
    expect(ids(insertSectionAfter(three(), added, "aaaaaa1"))).toEqual(["aaaaaa1", "dddddd1", "bbbbbb1", "cccccc1"]);
    expect(ids(insertSectionAfter(three(), added, null))).toEqual(["aaaaaa1", "bbbbbb1", "cccccc1", "dddddd1"]);
    expect(ids(insertSectionAfter(three(), added, "missing"))).toEqual(["aaaaaa1", "bbbbbb1", "cccccc1", "dddddd1"]);
  });

  it("refuses to grow past the section limit", () => {
    const full = doc(Array.from({ length: 30 }, (_, i) => newSection("text", `text${String(i).padStart(4, "0")}`)));
    expect(insertSectionAfter(full, newSection("text", "extra01"), null)).toBe(full);
  });

  it("moves, replaces and removes without touching the original", () => {
    const original = three();
    expect(ids(moveSectionTo(original, 0, 2))).toEqual(["bbbbbb1", "cccccc1", "aaaaaa1"]);
    expect(moveSectionTo(original, 0, 5)).toBe(original);
    expect(ids(removeSection(original, "bbbbbb1"))).toEqual(["aaaaaa1", "cccccc1"]);
    expect(removeSection(original, "missing")).toBe(original);
    const renamed = replaceSection(original, { ...original.sections[1]!, title: "Join" });
    expect(renamed.sections[1]!.title).toBe("Join");
    expect(original.sections[1]!.title).toBe("Membership");
  });

  it("reads and writes dotted paths immutably", () => {
    const buttons = { ...newSection("buttons", "eeeeee1") } as Extract<PageSection, { type: "buttons" }>;
    const next = setIn(buttons, "items.0.label", "Join today");
    expect(getIn(next, "items.0.label")).toBe("Join today");
    expect(buttons.items[0]!.label).toBe("See membership plans");
    expect(setIn({ tagline: "a" }, "tagline", "b")).toEqual({ tagline: "b" });
  });

  it("splits the server's errors by section", () => {
    const errors = { "sections.2.items.0.label": ["Name the button"], "sections.0.title": ["Too long"], accentColor: ["Choose another colour"] };
    expect(sectionsWithErrors(errors)).toEqual([0, 2]);
    expect(errorsForSection(errors, 2)).toEqual({ "items.0.label": ["Name the button"] });
  });
});

describe("public page editor: block library", () => {
  it("puts every block type in a category with a preview", () => {
    for (const type of SECTION_TYPES) {
      expect(BLOCK_CATEGORIES).toContain(BLOCK_CATEGORY[type]);
      expect(BLOCK_PREVIEWS[type].length).toBeGreaterThan(0);
    }
    const listed = BLOCK_CATEGORIES.flatMap((category) => blocksFor(category, ""));
    expect([...listed].sort()).toEqual([...SECTION_TYPES].sort());
  });

  it("searches names and descriptions", () => {
    expect(blocksFor("Live numbers", "grouping")).toEqual(["liveStats"]);
    expect(blocksFor("Layout and design", "wave")).toEqual(["divider"]);
    expect(blocksFor("Areas", "nothing like this")).toEqual([]);
  });
});

describe("public page editor: editing in place", () => {
  it("lists plain text fields in render order and never markdown bodies", () => {
    const hero = { ...newSection("hero", "hhhhhh1"), headline: "Welcome", subtitle: "Makers of Kochi" } as PageSection;
    expect(inlineFields(hero).map((field) => field.path)).toEqual(["headline", "subtitle", "primary.label"]);
    const about = { ...newSection("about", "aaaaaa2"), markdown: "**Bold**" } as PageSection;
    expect(inlineFields(about).map((field) => field.path)).toEqual(["title"]);
    expect(inlineFields(newSection("membersPreview", "mmmmmm1")).map((field) => field.path)).toContain("points.3");
  });

  it("finds the field under a point by its text, telling repeated texts apart", () => {
    const root = document.createElement("div");
    root.innerHTML = "<h2>Join us</h2><p><a>Join now</a><a>Join now</a></p>";
    document.body.append(root);
    const fields = [
      { path: "title", value: "Join us", multiline: false, max: 80 },
      { path: "items.0.label", value: "Join now", multiline: false, max: 40 },
      { path: "items.1.label", value: "Join now", multiline: false, max: 40 },
    ];
    const anchors = root.querySelectorAll("a");
    // jsdom has no layout: give each text a box to hit.
    const boxes = new Map<Node, DOMRect>([[root.querySelector("h2")!.firstChild!, new DOMRect(0, 0, 100, 20)], [anchors[0]!.firstChild!, new DOMRect(0, 30, 50, 20)], [anchors[1]!.firstChild!, new DOMRect(60, 30, 50, 20)]]);
    const createRange = document.createRange.bind(document);
    document.createRange = () => {
      const range = createRange();
      let node: Node | null = null;
      range.selectNodeContents = (target: Node) => { node = target; };
      range.getClientRects = () => ({ length: 1, item: () => boxes.get(node!)!, [Symbol.iterator]: function* () { yield boxes.get(node!)!; } }) as unknown as DOMRectList;
      return range;
    };
    expect(pickInlineField(root, 10, 10, fields)?.field.path).toBe("title");
    expect(pickInlineField(root, 70, 40, fields)?.field.path).toBe("items.1.label");
    expect(pickInlineField(root, 10, 40, fields)?.element).toBe(anchors[0]);
    expect(pickInlineField(root, 300, 300, fields)).toBeNull();
    document.createRange = createRange;
  });
});
