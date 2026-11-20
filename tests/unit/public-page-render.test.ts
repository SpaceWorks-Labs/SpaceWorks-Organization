import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageSections, type PageLive } from "@/components/public/PageSections";
import type { PublicPlan } from "@/components/public/PlanCards";
import { newSection, pageDocumentSchema, SECTION_TYPES, type PageDocument, type PageSection } from "@/lib/publicPage/sections";

const ORG = "org_abc123";
const KEY = `organisations/${ORG}/page-images/3f2b8c1e-1d2a-4c3b-9a8b-7c6d5e4f3a2b.webp`;
const PLAN: PublicPlan = {
  id: "plan1", name: "Annual", slug: "annual", description: "", currency: "INR", durationType: "ROLLING", durationMonths: 12, fixedEndDate: null,
  priceNewMinor: 50000, priceRenewalMinor: 50000, joiningFeeMinor: 0, joinMode: "OPEN", allUnits: true, units: [],
};
const live = (overrides: Partial<PageLive> = {}): PageLive => ({
  org: { name: "Kochi Makers", slug: "kochi-makers", kind: "Makerspace", logoUrl: null, locale: "en-IN", financialYearStartMonth: 4, unitLevels: ["Area"] },
  plans: [PLAN],
  units: [{ id: "u1", name: "North", level: 1, parentId: null }],
  takingMembers: true,
  preview: false,
  counts: { total: 42, byPlan: [{ label: "Annual", count: 30 }], byUnit: [{ label: "North", count: 12 }] },
  sampleCard: { src: "/api/o/kochi-makers/sample-card?v=abc", widthMm: 85.6, heightMm: 54 },
  ...overrides,
});
const doc = (sections: PageSection[], extra: Partial<PageDocument> = {}): PageDocument => ({ tagline: "Makers of Kochi", coverAssetKey: null, accentColor: null, sections, ...extra });
const render = (document: PageDocument, overrides: Partial<PageLive> = {}) => renderToStaticMarkup(createElement(PageSections, { document, ...live(overrides) }));

/** Every section type with real content, valid against the schema. */
function filled(): PageSection[] {
  const action = { kind: "plans" as const, label: "Join us", planSlug: "", url: "" };
  const raw: unknown[] = [
    { ...newSection("plans", "plans00001"), title: "Membership" },
    { ...newSection("cta", "cta0000001"), headline: "Ready to join?", body: "Come along on Saturday.", tone: "ink", primary: action, secondary: { kind: "link", label: "Read more", planSlug: "", url: "https://example.org" } },
    { ...newSection("counts", "counts0001"), byPlan: true, byUnit: true },
    newSection("card", "card000001"),
    { ...newSection("about", "about00001"), markdown: "## Who we are\nWe **build** things." },
    newSection("units", "units00001"),
    { ...newSection("committee", "committee1"), people: [{ name: "Priya Nair", role: "Secretary", photoKey: KEY, url: "https://example.org/priya" }, { name: "Arun Das", role: "", photoKey: null, url: "" }] },
    { ...newSection("testimonials", "testimon01"), items: [{ quote: "The best Saturday of my week.", name: "Meera", role: "Member since 2021" }] },
    { ...newSection("timeline", "timeline01"), items: [{ date: "2019", title: "First meetup", body: "Twelve of us in a garage." }] },
    { ...newSection("stats", "stats00001"), items: [{ value: "120+", label: "Workshops a year" }] },
    { ...newSection("imageText", "imagetext1"), imageKey: KEY, imageAlt: "The workshop", markdown: "Tools for everyone.", side: "right", primary: action },
    { ...newSection("video", "video00001"), url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", caption: "A tour" },
    { ...newSection("gallery", "gallery001"), images: [{ key: KEY, alt: "Members at work" }] },
    { ...newSection("downloads", "download01"), files: [{ key: KEY, label: "Poster" }] },
    { ...newSection("faq", "faq0000001"), items: [{ question: "Can I visit?", answer: "Yes, on open days." }] },
    { ...newSection("links", "links00001"), links: [{ kind: "website", label: "Website", url: "https://example.org" }] },
    { ...newSection("contact", "contact001"), email: "hello@example.org", address: "1 Main Road" },
    { ...newSection("map", "map0000001"), address: "1 Main Road", url: "https://www.openstreetmap.org/#map=18/9.9/76.2" },
    { ...newSection("text", "text000001"), body: "See you there." },
  ];
  const parsed = pageDocumentSchema.parse({ tagline: "", coverAssetKey: null, accentColor: null, sections: raw });
  return parsed.sections;
}

describe("public page renderers", () => {
  it("renders every section type, empty or filled, in public and preview mode", () => {
    for (const type of SECTION_TYPES) {
      const empty = doc([newSection(type, `empty${type.toLowerCase().slice(0, 8).padEnd(5, "x")}`)]);
      expect(() => render(empty)).not.toThrow();
      expect(() => render(empty, { preview: true })).not.toThrow();
    }
    const html = render(doc(filled()));
    for (const text of ["Ready to join?", "current members", "Priya Nair", "The best Saturday of my week.", "First meetup", "120+", "Tools for everyone.", "Play video", "Poster", "Can I visit?", "Open in maps", "See you there.", "Who we are"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain('href="#section-plans00001"');
    expect(html).toContain('id="section-plans00001"');
  });

  it("makes a leading hero the page's h1, with the tenant logo still and its buttons resolved", () => {
    const hero = { ...newSection("hero", "hero000001"), headline: "Build things together", primary: { kind: "join" as const, label: "Join now", planSlug: "annual", url: "" } } as PageSection;
    const html = render(doc([hero, newSection("plans", "plans00001")]));
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Build things together/);
    expect(html).toContain("data-tenant-logo");
    expect(html).toContain('href="/o/kochi-makers/join/annual"');
    expect(html).toContain("Makers of Kochi");
    // Without a leading hero the plain top keeps the organisation's name as the h1.
    expect(render(doc([newSection("plans", "plans00001"), hero]))).toMatch(/<h1[^>]*>Kochi Makers<\/h1>/);
  });

  it("renders organisation text as text, never as markup", () => {
    const about = { ...newSection("about", "about00001"), markdown: '<script>alert("x")</script> [x](javascript:alert(1))' } as PageSection;
    const text = { ...newSection("text", "text000001"), body: "<img src=x onerror=alert(1)>" } as PageSection;
    const html = render(doc([about, text]));
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("&lt;script&gt;");
  });

  it("never loads a video frame in the editor preview, nor before a visitor presses play", () => {
    const video = { ...newSection("video", "video00001"), url: "https://youtu.be/dQw4w9WgXcQ" } as PageSection;
    expect(render(doc([video]), { preview: true })).not.toContain("<iframe");
    expect(render(doc([video]))).not.toContain("<iframe");
    const notAllowed = { ...newSection("video", "video00002"), url: "https://example.org/video" } as PageSection;
    expect(render(doc([notAllowed]))).not.toContain("Play video");
  });

  it("leaves out counts that are all hidden for visitors, and explains them in the preview", () => {
    const counts = { ...newSection("counts", "counts0001"), title: "Our members", byPlan: true } as PageSection;
    const hidden = { counts: { total: null, byPlan: [], byUnit: [] } };
    expect(render(doc([counts]), hidden)).not.toContain("Our members");
    expect(render(doc([counts]), { ...hidden, preview: true })).toContain("at least 5 current members");
    expect(render(doc([counts]), { counts: null })).not.toContain("Our members");
  });

  it("draws the sample card only from the sample card route, and leaves it out without one", () => {
    const card = newSection("card", "card000001");
    const html = render(doc([card]));
    const images = [...html.matchAll(/<img[^>]*src="([^"]+)"/g)].map((match) => match[1]);
    expect(images).toEqual(["/api/o/kochi-makers/sample-card?v=abc"]);
    expect(html).toContain("Sample card");
    expect(render(doc([card]), { sampleCard: null })).not.toContain("Your member card");
  });
});
