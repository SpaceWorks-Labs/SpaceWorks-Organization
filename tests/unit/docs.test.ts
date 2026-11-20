import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDocs, collectDocs, describe as describeDoc, SECTIONS } from "../../scripts/build-docs.mjs";
import { catalogSlugs } from "../../scripts/docs/manifest.mjs";
import { headings as buildHeadings } from "../../scripts/docs/markdown.mjs";
import { DOCS } from "@/lib/docs/content";
import { extractHeadings } from "@/lib/docs/headings";
import { resolveDocHref, resolveDocImage } from "@/lib/docs/links";
import { DOC_SLUGS, editUrl, getDoc, neighbours } from "@/lib/docs/pages";
import { DOCS_SLUGS } from "@/lib/features/catalog";

type Doc = { slug: string; section: string; title: string; summary: string; body: string; source: string; generated: boolean; updated: string | null };
const root = join(import.meta.dirname, "../..");
const docs = collectDocs(root, { git: false }) as Doc[];

describe("build-docs", () => {
  it("publishes every catalogue area as a feature guide, in catalogue order", () => {
    expect(catalogSlugs(root)).toEqual([...DOCS_SLUGS]);
    expect(docs.filter((doc) => doc.section === "features").map((doc) => doc.slug)).toEqual([...DOCS_SLUGS]);
  });

  it("fills every home section and never reads plans or readme", () => {
    for (const section of SECTIONS) expect(docs.filter((doc) => doc.section === section.key).length).toBeGreaterThan(2);
    expect(docs.some((doc) => /^docs\/(plans|readme)\//.test(doc.source))).toBe(false);
    expect(docs.some((doc) => /\]\([^)]*plans\//.test(doc.body))).toBe(false);
    expect(new Set(docs.map((doc) => doc.slug)).size).toBe(docs.length);
    for (const slug of ["quickstart-owner", "owners", "super-admins", "choose-your-hosting", "deployment-cloudflare", "audit-actions", "environment-variables", "changelog", "decisions"]) {
      expect(docs.map((doc) => doc.slug)).toContain(slug);
    }
  });

  it("gives every doc a title, a summary and no leading h1; feature guides keep the §12.1 sections", () => {
    for (const doc of docs) {
      expect(doc.title.length, doc.slug).toBeGreaterThan(0);
      expect(doc.summary.length, doc.slug).toBeGreaterThan(0);
      expect(doc.body.startsWith("# "), doc.slug).toBe(false);
    }
    for (const doc of docs.filter((entry) => entry.section === "features")) {
      for (const heading of ["## What it does", "## Who can use it", "## Turning it on or off", "## Screenshots", "## API"]) expect(doc.body, doc.slug).toContain(heading);
      expect(doc.body).toContain(`/screens/${doc.slug}-light.webp`);
      expect(doc.body).toContain(`/screens/${doc.slug}-dark.webp`);
    }
  });

  // Builds every docs page twice; about a second alone, but slower when the whole suite runs in parallel.
  it("is deterministic and matches the committed modules' pages", () => {
    expect(buildDocs(root)).toEqual(buildDocs(root));
    expect(DOCS.map((doc) => doc.slug)).toEqual(docs.map((doc) => doc.slug));
    expect(DOCS.map((doc) => doc.section)).toEqual(docs.map((doc) => doc.section));
  }, 30_000);

  it("never quotes the image placeholder hosts, which the entrypoint would find in the built docs", () => {
    const text = JSON.stringify(DOCS);
    for (const host of ["origin", "backend"]) expect(text).not.toContain(`spaceworks-organization-${host}.invalid`);
  });

  it("takes the first heading and the first plain paragraph", () => {
    expect(describeDoc("# Title\n\n- list\n\nFirst **line**\nsecond [link](x.md).\n\n## More", "x")).toEqual({ title: "Title", summary: "First line second link." });
  });

  it("gives headings the same ids at build time and in the viewer", () => {
    for (const doc of docs) expect(buildHeadings(doc.body).map((heading: { id: string }) => heading.id)).toEqual(extractHeadings(doc.body).map((heading) => heading.id));
  });
});

describe("pages", () => {
  it("serves only listed slugs", () => {
    expect(getDoc("payments")?.section).toBe("features");
    expect(getDoc("plans")).toBeNull();
    expect(getDoc("../../etc/passwd")).toBeNull();
    expect(DOC_SLUGS).toContain("deployment-vps");
  });

  it("links previous and next inside a section only", () => {
    expect(neighbours("organisations").previous).toBeNull();
    expect(neighbours("organisations").next?.slug).toBe("units");
    expect(neighbours("quickstart-member")).toMatchObject({ previous: { slug: "quickstart-owner" }, next: { slug: "quickstart-operator" } });
  });

  it("edits sources on the dev branch, and never generated pages", () => {
    expect(editUrl(getDoc("units")!)).toBe("https://github.com/SpaceWorks-Labs/SpaceWorks-Organization/edit/dev/docs/features/units.md");
    expect(editUrl(getDoc("changelog")!)).toBe("https://github.com/SpaceWorks-Labs/SpaceWorks-Organization/edit/dev/CHANGELOG.md");
    expect(editUrl(getDoc("audit-actions")!)).toBeNull();
  });
});

describe("link filtering", () => {
  it("drops unsafe links and plans", () => {
    expect(resolveDocHref("javascript:alert(1)")).toBeNull();
    expect(resolveDocHref("data:text/html,x")).toBeNull();
    expect(resolveDocHref("//evil.example/x")).toBeNull();
    expect(resolveDocHref("../../../etc/passwd", "docs/features/units.md")).toBeNull();
    expect(resolveDocHref("plans/x.md", "docs/GST.md")).toBeNull();
    expect(resolveDocHref("../plans/x.md", "docs/features/units.md")).toBeNull();
    expect(resolveDocHref("/docs/not-a-page")).toBeNull();
  });

  it("keeps safe links, rewrites doc links and sends other repository files to GitHub", () => {
    expect(resolveDocHref("https://github.com/SpaceWorks-Labs/SpaceWorks-Organization")).toBe("https://github.com/SpaceWorks-Labs/SpaceWorks-Organization");
    expect(resolveDocHref("mailto:team@example.org")).toBe("mailto:team@example.org");
    expect(resolveDocHref("#api")).toBe("#api");
    expect(resolveDocHref("GST.md", "docs/PAYMENTS.md")).toBe("/docs/gst");
    expect(resolveDocHref("DEPLOYMENT_VPS.md#encrypted-off-site-copies", "docs/CONFIGURATION.md")).toBe("/docs/deployment-vps#encrypted-off-site-copies");
    expect(resolveDocHref("units.md", "docs/features/groupings.md")).toBe("/docs/units");
    expect(resolveDocHref("../../manuals/owners.md", "docs/guides/start/quickstart-owner.md")).toBe("/docs/owners");
    expect(resolveDocHref("../CHANGELOG.md", "docs/GST.md")).toBe("/docs/changelog");
    expect(resolveDocHref("/docs/payments")).toBe("/docs/payments");
    expect(resolveDocHref("../scripts/backup.sh", "docs/DEPLOYMENT_VPS.md")).toBe("https://github.com/SpaceWorks-Labs/SpaceWorks-Organization/blob/dev/scripts/backup.sh");
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
  it("gives h2 to h4 stable, unique ids and skips code fences", () => {
    const found = extractHeadings("# T\n\n## Setup\n\n```\n## not a heading\n```\n\n### Setup\n\n## Setup\n\n#### Deep");
    expect(found.map((heading) => heading.id)).toEqual(["setup", "setup-2", "setup-3", "deep"]);
    expect(found.map((heading) => heading.level)).toEqual([2, 3, 2, 4]);
  });
});
