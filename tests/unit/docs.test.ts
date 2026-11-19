import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDocs, collectDocs, describe as describeDoc } from "../../scripts/build-docs.mjs";
import { DOCS } from "@/lib/docs/content";
import { extractHeadings } from "@/lib/docs/headings";
import { resolveDocHref, resolveDocImage } from "@/lib/docs/links";
import { DOC_SLUGS, getDoc } from "@/lib/docs/pages";

const root = join(import.meta.dirname, "../..");
const FEATURE_SLUGS = [
  "organisations", "units", "staff-and-roles", "plans-and-join-forms", "renewals", "payments", "receipts-and-refunds",
  "member-cards", "member-portal", "public-page", "reports-and-analytics", "notifications", "web-analytics", "self-hosting",
];

describe("build-docs", () => {
  const docs = collectDocs(root) as Array<{ slug: string; section: string; title: string; summary: string; body: string }>;

  it("covers every feature page and the operator allow-list, nothing from plans or readme", () => {
    const slugs = docs.map((doc) => doc.slug);
    for (const slug of FEATURE_SLUGS) expect(slugs).toContain(slug);
    expect(docs.filter((doc) => doc.section === "operators")).toHaveLength(10);
    expect(slugs.some((slug) => slug.includes("plan") && slug !== "plans-and-join-forms")).toBe(false);
    expect(docs.some((doc) => doc.body.includes("docs/plans/"))).toBe(false);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("gives every doc a title, a summary and the feature sections", () => {
    for (const doc of docs) {
      expect(doc.title.length).toBeGreaterThan(0);
      expect(doc.summary.length).toBeGreaterThan(0);
    }
    for (const doc of docs.filter((entry) => entry.section === "features")) {
      for (const heading of ["## What it does", "## Who can use it", "## Turning it on or off", "## Screenshots", "## API"]) expect(doc.body).toContain(heading);
      expect(doc.body).toContain(`/screens/${doc.slug}-light.webp`);
      expect(doc.body).toContain(`/screens/${doc.slug}-dark.webp`);
    }
  });

  it("is deterministic and matches the committed module", () => {
    expect(buildDocs(root)).toBe(buildDocs(root));
    expect(DOCS.map((doc) => doc.slug)).toEqual(docs.map((doc) => doc.slug));
  });

  it("takes the first heading and the first plain paragraph", () => {
    expect(describeDoc("# Title\n\n- list\n\nFirst **line**\nsecond [link](x.md).\n\n## More", "x")).toEqual({ title: "Title", summary: "First line second link." });
  });
});

describe("slug allow-list", () => {
  it("serves only listed slugs", () => {
    expect(getDoc("payments")?.section).toBe("features");
    expect(getDoc("plans")).toBeNull();
    expect(getDoc("../../etc/passwd")).toBeNull();
    expect(DOC_SLUGS).toContain("deployment-vps");
  });
});

describe("link filtering", () => {
  it("drops unsafe links", () => {
    expect(resolveDocHref("javascript:alert(1)")).toBeNull();
    expect(resolveDocHref("data:text/html,x")).toBeNull();
    expect(resolveDocHref("//evil.example/x")).toBeNull();
    expect(resolveDocHref("../README.md")).toBeNull();
    expect(resolveDocHref("docs/plans/x.md")).toBeNull();
  });

  it("keeps safe links and rewrites relative doc links", () => {
    expect(resolveDocHref("https://github.com/SpaceWorks-Labs/SpaceWorks-Organization")).toBe("https://github.com/SpaceWorks-Labs/SpaceWorks-Organization");
    expect(resolveDocHref("mailto:team@example.org")).toBe("mailto:team@example.org");
    expect(resolveDocHref("#api")).toBe("#api");
    expect(resolveDocHref("GST.md")).toBe("/docs/gst");
    expect(resolveDocHref("DEPLOYMENT_VPS.md#encrypted-off-site-copies")).toBe("/docs/deployment-vps#encrypted-off-site-copies");
    expect(resolveDocHref("units.md")).toBe("/docs/units");
    expect(resolveDocHref("/docs/payments")).toBe("/docs/payments");
  });

  it("allows images only from screens and brand", () => {
    expect(resolveDocImage("/screens/payments-light.webp")).toBe("/screens/payments-light.webp");
    expect(resolveDocImage("/brand/logo.svg")).toBe("/brand/logo.svg");
    expect(resolveDocImage("https://example.org/x.png")).toBeNull();
    expect(resolveDocImage("/screens/../secret.png")).toBeNull();
    expect(resolveDocImage("/uploads/x.png")).toBeNull();
  });
});

describe("headings", () => {
  it("gives h2 and h3 stable, unique ids and skips code fences", () => {
    const found = extractHeadings("# T\n\n## Setup\n\n```\n## not a heading\n```\n\n### Setup\n\n## Setup");
    expect(found.map((heading) => heading.id)).toEqual(["setup", "setup-2", "setup-3"]);
    expect(found.map((heading) => heading.level)).toEqual([2, 3, 2]);
  });
});
