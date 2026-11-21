import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageSections, type PageLive } from "@/components/public/PageSections";
import { AreaBreadcrumb, OtherAreas, siblingAreas } from "@/components/public/AreaNav";
import type { AreaContext, AreaEntry, LiveStatResult } from "@/lib/publicPage/blockData";
import { newSection, type PageDocument, type PageSection } from "@/lib/publicPage/sections";

const contact = { email: "north@example.org", phone: "+91 98765 43210", website: "https://north.example.org" };
const entry = (id: string, code: string, level: number, path: string, parentId: string | null, joinPlans = ["annual"]): AreaEntry => ({
  id, code, name: `Area ${code}`, level, levelLabel: level === 0 ? "Region" : "Unit", parentId, path, contact, joinPlans, pageHref: `/o/kochi-makers/a/${code}`,
});
const AREAS = [entry("n", "N", 0, "n", null), entry("s", "S", 0, "s", null, []), entry("n1", "N1", 1, "n/n1", "n"), entry("n2", "N2", 1, "n/n2", "n")];
const AREA: AreaContext = {
  id: "n1", code: "N1", name: "Area N1", level: 1, levelLabel: "Unit", path: "n/n1", contact, ownContact: { email: null, phone: null, website: null },
  trail: [{ name: "Area N", code: "N", pageHref: "/o/kochi-makers/a/N" }, { name: "Area N1", code: "N1", pageHref: "/o/kochi-makers/a/N1" }],
};

const live = (overrides: Partial<PageLive> = {}): PageLive => ({
  org: { name: "Kochi Makers", slug: "kochi-makers", kind: "Makerspace", logoUrl: null, locale: "en-IN", financialYearStartMonth: 4, unitLevels: ["Region", "Unit"] },
  plans: [], units: [], takingMembers: true, preview: false, counts: null, sampleCard: null, ...overrides,
});
const doc = (sections: PageSection[]): PageDocument => ({ tagline: "Makers of Kochi", coverAssetKey: null, accentColor: null, sections });
const render = (document: PageDocument, overrides: Partial<PageLive> = {}) => renderToStaticMarkup(createElement(PageSections, { document, ...live(overrides) }));
const h1s = (html: string) => html.match(/<h1[\s>]/g)?.length ?? 0;
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");

describe("area pages", () => {
  const hero = { ...newSection("hero", "hero000001"), headline: "Build with us" } as PageSection;
  const plain = doc([newSection("text", "text000001")]);

  it("folds the area into the one h1 of the plain top and of a leading hero", () => {
    for (const document of [plain, doc([hero])]) {
      const html = render(document, { area: AREA });
      expect(h1s(html)).toBe(1);
      const heading = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)![1]!;
      expect(text(heading)).toContain("Area N1");
      expect(html).toContain(">Unit<");
    }
  });

  it("renders exactly as before without an area", () => {
    for (const document of [plain, doc([hero])]) {
      const html = render(document);
      expect(render(document, { area: null })).toBe(html);
      expect(h1s(html)).toBe(1);
      expect(html).not.toContain("Area N1");
    }
  });

  it("leads back up the trail and across to the other areas", () => {
    const crumbs = renderToStaticMarkup(createElement(AreaBreadcrumb, { orgName: "Kochi Makers", orgSlug: "kochi-makers", area: AREA }));
    expect(crumbs).toContain('href="/o/kochi-makers"');
    expect(crumbs).toContain('href="/o/kochi-makers/a/N"');
    expect(crumbs).toMatch(/aria-current="page"[^>]*>Area N1</);
    expect(siblingAreas(AREA, AREAS).map((area) => area.code)).toEqual(["N2"]);
    const foot = renderToStaticMarkup(createElement(OtherAreas, { orgName: "Kochi Makers", orgSlug: "kochi-makers", area: AREA, areas: AREAS }));
    expect(foot).toContain('href="/o/kochi-makers/a/N2"');
    expect(foot).not.toContain('href="/o/kochi-makers/a/S"');
    expect(foot).toContain("Back to Kochi Makers");
  });
});

describe("new block renderers", () => {
  const stats = (display: "numbers" | "bars" | "list", results: LiveStatResult[]) => {
    const section = { ...newSection("liveStats", "stats00001"), display } as PageSection;
    return render(doc([section]), { liveStats: { stats00001: results } });
  };
  const total = (value: number | null): LiveStatResult => ({ kind: "total", label: "Total members", value, percent: null, rows: [] });
  const byArea = (rows: Array<{ label: string; count: number }>): LiveStatResult => ({ kind: "byArea", label: "Members by region", value: null, percent: null, rows });

  it("says fewer than 5 for a hidden figure and that small groups are left out", () => {
    for (const display of ["numbers", "bars", "list"] as const) {
      const html = stats(display, [total(null), { kind: "growth", days: 90, label: "New members in 90 days", value: 12, percent: 25, rows: [] }, byArea([{ label: "North", count: 9 }, { label: "South", count: 6 }])]);
      expect(html).toContain("Fewer than 5");
      expect(html).toContain("+25% growth");
      expect(text(html)).toContain("Groups with fewer than 5 members aren't shown");
      expect(html).toContain("North");
    }
    expect(stats("numbers", [total(42), byArea([])])).toContain("Every group has fewer than 5 members");
  });

  it("gives each area card its page and a join link set to the area", () => {
    const section = { ...newSection("areas", "areas00001") } as PageSection;
    const html = render(doc([section]), { areas: AREAS });
    expect(html).toContain('href="/o/kochi-makers/a/N"');
    expect(html).toContain('href="/o/kochi-makers/join/annual?unit=N"');
    expect(html).toContain("Join in Area N");
    expect(text(html)).toContain("Visit page for Area S");
    // Area S offers no open plan, so it has no join link.
    expect(html).not.toContain("Join in Area S");
    expect(html).toContain('href="mailto:north@example.org"');
    const preview = render(doc([section]), { areas: AREAS, preview: true });
    expect(preview).not.toContain("/join/annual");
  });

  it("draws column headings below the section heading and a decorative divider", () => {
    const columns = { ...newSection("columns", "columns001"), title: "Why join", columns: [{ items: [{ type: "heading", text: "Tools", level: 2 }] }, { items: [{ type: "heading", text: "People", level: 3 }] }] } as PageSection;
    const html = render(doc([columns, { ...newSection("divider", "divider001"), variant: "wave" } as PageSection]));
    expect(html).toMatch(/<h3[^>]*>Tools<\/h3>/);
    expect(html).toMatch(/<h4[^>]*>People<\/h4>/);
    expect(html).toContain('id="divider-wave-divider001"');
  });
});
