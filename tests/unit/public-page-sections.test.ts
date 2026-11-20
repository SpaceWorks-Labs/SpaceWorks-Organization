import { describe, expect, it } from "vitest";
import { isMapLink, videoEmbed } from "@/lib/publicPage/embeds";
import { actionHref, countsWanted, MIN_PUBLIC_COUNT, plansSectionId, publicTotal, suppressSmallCounts } from "@/lib/publicPage/live";
import { duplicateSection } from "@/lib/publicPage/defaults";
import { documentImageKeys, EMPTY_ACTION, leadingHero, newSection, pageDocumentSchema, readPageDocument, SECTION_TYPES, sectionSchema, type PageDocument } from "@/lib/publicPage/sections";
import { documentHasContent, PAGE_TEMPLATES, templateDocument } from "@/lib/publicPage/templates";

const ORG = "org_abc123";
const KEY = `organisations/${ORG}/page-images/3f2b8c1e-1d2a-4c3b-9a8b-7c6d5e4f3a2b.webp`;
const LOGO_KEY = `organisations/${ORG}/organisation-logos/3f2b8c1e-1d2a-4c3b-9a8b-7c6d5e4f3a2b.webp`;
const doc = (sections: unknown[], extra: Record<string, unknown> = {}) => ({ tagline: "", coverAssetKey: null, accentColor: null, sections, ...extra });
const ok = (section: unknown) => sectionSchema.safeParse(section).success;
let counter = 0;
const id = () => `sect${String(counter++).padStart(6, "0")}`;

describe("new public page sections", () => {
  it("accepts a new section of every type, and every type has a schema", () => {
    const sections = SECTION_TYPES.map((type) => newSection(type, id()));
    const parsed = pageDocumentSchema.safeParse(doc(sections));
    expect(parsed.success).toBe(true);
    expect(parsed.data?.sections.map((section) => section.type)).toEqual([...SECTION_TYPES]);
  });

  it("keeps text within its limits", () => {
    const hero = newSection("hero", id());
    expect(ok({ ...hero, headline: "x".repeat(120) })).toBe(true);
    expect(ok({ ...hero, headline: "x".repeat(121) })).toBe(false);
    expect(ok({ ...newSection("stats", id()), items: [{ value: "1".repeat(17), label: "Members" }] })).toBe(false);
    expect(ok({ ...newSection("stats", id()), items: Array.from({ length: 9 }, () => ({ value: "12", label: "Years" })) })).toBe(false);
    expect(ok({ ...newSection("testimonials", id()), items: [{ quote: "q".repeat(501), name: "A member", role: "" }] })).toBe(false);
    expect(ok({ ...newSection("timeline", id()), items: [{ date: "", title: "Founded", body: "" }] })).toBe(false);
    expect(ok({ ...newSection("committee", id()), people: Array.from({ length: 25 }, () => ({ name: "Office bearer", role: "", photoKey: null, url: "" })) })).toBe(false);
    expect(ok({ ...newSection("downloads", id()), files: [{ key: KEY, label: "" }] })).toBe(false);
  });

  it("refuses buttons and links that could run script, and buttons without a label or address", () => {
    const cta = newSection("cta", id());
    for (const url of ["javascript:alert(1)", "data:text/html,x", "//evil.test"]) {
      expect(ok({ ...cta, primary: { kind: "link", label: "Go", planSlug: "", url } })).toBe(false);
      expect(ok({ ...newSection("committee", id()), people: [{ name: "Chair", role: "", photoKey: null, url }] })).toBe(false);
    }
    expect(ok({ ...cta, primary: { kind: "link", label: "Go", planSlug: "", url: "https://example.org" } })).toBe(true);
    expect(ok({ ...cta, primary: { kind: "link", label: "", planSlug: "", url: "https://example.org" } })).toBe(false);
    expect(ok({ ...cta, primary: { kind: "link", label: "Go", planSlug: "", url: "" } })).toBe(false);
    expect(ok({ ...cta, primary: { kind: "join", label: "Join", planSlug: "../admin", url: "" } })).toBe(false);
  });

  it("only takes images in the page-image upload shape, and lists every image for the ownership check", () => {
    for (const key of [LOGO_KEY, "../../etc/passwd", "https://evil.test/a.webp"]) {
      expect(ok({ ...newSection("hero", id()), imageKey: key })).toBe(false);
      expect(ok({ ...newSection("imageText", id()), imageKey: key })).toBe(false);
      expect(ok({ ...newSection("committee", id()), people: [{ name: "Chair", role: "", photoKey: key, url: "" }] })).toBe(false);
      expect(ok({ ...newSection("downloads", id()), files: [{ key, label: "Poster" }] })).toBe(false);
    }
    const document = pageDocumentSchema.parse(doc([
      { ...newSection("hero", id()), imageKey: KEY },
      { ...newSection("imageText", id()), imageKey: KEY },
      { ...newSection("committee", id()), people: [{ name: "Chair", role: "", photoKey: KEY, url: "" }, { name: "Treasurer", role: "", photoKey: null, url: "" }] },
      { ...newSection("downloads", id()), files: [{ key: KEY, label: "Poster" }] },
    ]));
    expect(documentImageKeys(document)).toEqual([KEY, KEY, KEY, KEY]);
  });

  it("takes YouTube and Vimeo only, always through the privacy-enhanced or do-not-track player", () => {
    expect(videoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.embedUrl).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0");
    expect(videoEmbed("https://youtu.be/dQw4w9WgXcQ")?.id).toBe("dQw4w9WgXcQ");
    expect(videoEmbed("https://vimeo.com/76979871")?.embedUrl).toBe("https://player.vimeo.com/video/76979871?dnt=1");
    for (const url of ["http://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://evil.test/watch?v=dQw4w9WgXcQ", "https://www.youtube.com.evil.test/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/watch?v=short", "javascript:alert(1)", "https://user:pw@vimeo.com/76979871"]) {
      expect(videoEmbed(url), url).toBeNull();
      expect(ok({ ...newSection("video", id()), url })).toBe(false);
    }
  });

  it("links out to maps services only", () => {
    for (const url of ["https://maps.app.goo.gl/abc123", "https://www.google.com/maps/place/Kochi", "https://www.openstreetmap.org/#map=15/9.9/76.2", "https://maps.apple.com/?q=Kochi"]) expect(isMapLink(url), url).toBe(true);
    for (const url of ["https://www.google.com/search?q=x", "https://evil.test/maps", "http://maps.apple.com/?q=x", "javascript:alert(1)"]) {
      expect(isMapLink(url), url).toBe(false);
      expect(ok({ ...newSection("map", id()), url })).toBe(false);
    }
  });

  it("allows one hero, which leads the page only when it is the first visible section", () => {
    const hero = newSection("hero", id());
    expect(pageDocumentSchema.safeParse(doc([hero, newSection("hero", id())])).success).toBe(false);
    const about = newSection("about", id());
    expect(leadingHero(doc([hero, about]) as PageDocument)?.id).toBe(hero.id);
    expect(leadingHero(doc([{ ...about, visible: false }, hero]) as PageDocument)?.id).toBe(hero.id);
    expect(leadingHero(doc([about, hero]) as PageDocument)).toBeNull();
  });

  it("needs at least one count chosen, and reads stored documents leniently", () => {
    const counts = { ...newSection("counts", id()), total: false, byPlan: false, byUnit: false };
    expect(pageDocumentSchema.safeParse(doc([counts])).success).toBe(false);
    const hero = newSection("hero", id());
    const read = readPageDocument(doc([hero, { ...hero, id: "secondhero1" }, counts, { ...newSection("video", "videosect1"), url: "https://evil.test/v" }, newSection("stats", "statsect01")]));
    expect(read.sections.map((section) => section.id)).toEqual([hero.id, "statsect01"]);
  });

  it("duplicates a section with a new id and an independent copy", () => {
    const original = sectionSchema.parse({ ...newSection("faq", id()), items: [{ question: "Who can join?", answer: "Anyone." }] });
    const copy = duplicateSection(original, "copyid0001");
    expect(copy).toMatchObject({ id: "copyid0001", type: "faq" });
    if (copy.type === "faq") copy.items[0]!.question = "Changed";
    expect(original).toMatchObject({ items: [{ question: "Who can join?" }] });
  });
});

describe("live counts privacy", () => {
  it("removes counts below the threshold and one more when only one row would be hidden", () => {
    expect(MIN_PUBLIC_COUNT).toBe(5);
    expect(publicTotal(4)).toBeNull();
    expect(publicTotal(5)).toBe(5);
    const rows = [{ label: "North", count: 40 }, { label: "South", count: 12 }, { label: "East", count: 3 }];
    // East alone would be hidden, so South goes too: 55 minus the shown rows can't give East away.
    expect(suppressSmallCounts(rows)).toEqual([{ label: "North", count: 40 }]);
    const two = [...rows, { label: "West", count: 2 }];
    expect(suppressSmallCounts(two)).toEqual([{ label: "North", count: 40 }, { label: "South", count: 12 }]);
    expect(suppressSmallCounts([{ label: "Only", count: 4 }])).toEqual([]);
  });

  it("asks only for the counts a visible section shows", () => {
    const counts = { ...newSection("counts", id()), total: false, byPlan: true, byUnit: false };
    const hidden = { ...newSection("counts", id()), total: true, byPlan: true, byUnit: true, visible: false };
    expect(countsWanted({ sections: [counts, hidden] } as PageDocument)).toEqual({ total: false, byPlan: true, byUnit: false });
  });
});

describe("section buttons", () => {
  const context = { orgSlug: "makers", plans: [{ slug: "annual", joinMode: "OPEN" }, { slug: "invite", joinMode: "INVITE_ONLY" }], takingMembers: true, plansSectionId: "planssect1" };
  it("goes to a plan's join page, the plans section or a safe link", () => {
    expect(actionHref({ kind: "join", label: "Join", planSlug: "annual", url: "" }, context)).toEqual({ href: "/o/makers/join/annual", external: false });
    expect(actionHref({ kind: "join", label: "Join", planSlug: "invite", url: "" }, context)).toEqual({ href: "#section-planssect1", external: false });
    expect(actionHref({ kind: "join", label: "Join", planSlug: "annual", url: "" }, { ...context, takingMembers: false })).toEqual({ href: "#section-planssect1", external: false });
    expect(actionHref({ kind: "plans", label: "Plans", planSlug: "", url: "" }, { ...context, plansSectionId: null })).toBeNull();
    expect(actionHref({ kind: "link", label: "Site", planSlug: "", url: "https://example.org" }, context)).toEqual({ href: "https://example.org", external: true });
    expect(actionHref({ ...EMPTY_ACTION }, context)).toBeNull();
    expect(plansSectionId({ sections: [{ ...newSection("plans", "hiddenplan"), visible: false }, newSection("plans", "shownplans")] } as PageDocument)).toBe("shownplans");
  });
});

describe("page templates", () => {
  const org = { name: "Sample society", description: "", contactEmail: "hello@example.org", contactPhone: null };
  const current = pageDocumentSchema.parse(doc([newSection("text", id())], { accentColor: "#006E63", coverAssetKey: KEY }));

  it("fills a valid draft for every template, keeping the accent and cover", () => {
    expect(PAGE_TEMPLATES.map((template) => template.id)).toEqual(["club", "alumni", "professional", "community", "sports", "cultural"]);
    for (const template of PAGE_TEMPLATES) {
      const filled = templateDocument(template.id, current, org, id);
      expect(pageDocumentSchema.safeParse(filled).success, template.id).toBe(true);
      expect(filled).toMatchObject({ accentColor: "#006E63", coverAssetKey: KEY });
      expect(leadingHero(filled), template.id).not.toBeNull();
      expect(filled.sections.some((section) => section.type === "plans"), template.id).toBe(true);
      expect(filled.sections.at(-1)?.type).toBe("contact");
      expect(filled.tagline.length).toBeGreaterThan(0);
    }
  });

  it("keeps a tagline already written and uses the organisation's own description", () => {
    const filled = templateDocument("club", { ...current, tagline: "Our own words" }, { ...org, description: "We build things." }, id);
    expect(filled.tagline).toBe("Our own words");
    expect(filled.sections.find((section) => section.type === "about")).toMatchObject({ markdown: "We build things." });
  });

  it("knows when applying would replace content, so the editor asks first", () => {
    expect(documentHasContent(pageDocumentSchema.parse(doc([])))).toBe(false);
    expect(documentHasContent(current)).toBe(true);
    expect(documentHasContent(pageDocumentSchema.parse(doc([], { tagline: "Hello" })))).toBe(true);
  });
});
