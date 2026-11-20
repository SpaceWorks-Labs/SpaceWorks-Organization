import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { actionLabel as buildLabel, activityCategories, collectAuditActions } from "../../scripts/docs/audit.mjs";
import { collectSchema } from "../../scripts/docs/env.mjs";
import { DocsMarkdown } from "@/components/docs/DocsMarkdown";
import { DOCS } from "@/lib/docs/content";
import { highlight, searchDocs } from "@/lib/docs/search";
import { SEARCH_INDEX } from "@/lib/docs/search-index";
import { actionLabel, activityCategory } from "@/lib/reports/activity";

const root = join(import.meta.dirname, "../..");
const page = (slug: string) => DOCS.find((doc) => doc.slug === slug)!;

describe("generated audit action reference", () => {
  const actions = collectAuditActions(root) as Array<{ action: string; files: string[] }>;

  it("lists known actions, including the spelled-out template families and the server script's", () => {
    const names = actions.map((entry) => entry.action);
    for (const action of ["MEMBERSHIP_APPROVE", "MEMBERSHIP_WITHDRAW", "ORGANISATION_APPROVED", "ORGANISATION_SUSPENDED", "CARD_ISSUED", "CARD_SCANNED", "PAYMENT_PAID", "SUPER_ADMIN_ORG_ENTERED", "SUPER_ADMIN_CREATED_ON_SERVER", "REPORT_EXPORTED"]) {
      expect(names).toContain(action);
    }
    expect(names).not.toContain("MEMBERSHIP_MARKPAID");
    expect(names.every((name) => /^[A-Z][A-Z0-9_]+$/.test(name) && name.includes("_"))).toBe(true);
  });

  it("labels and groups each action exactly as the activity log does", () => {
    const { categoryOf } = activityCategories(root);
    for (const { action } of actions) {
      expect(buildLabel(action)).toBe(actionLabel(action));
      expect(categoryOf(action)).toBe(activityCategory(action));
    }
  });

  it("is published with every action", () => {
    const body = page("audit-actions").body;
    for (const { action } of actions) expect(body).toContain(`\`${action}\``);
  });
});

describe("generated environment reference", () => {
  it("covers every variable the start-up schema checks, with its description", () => {
    const body = page("environment-variables").body;
    const schema = collectSchema(root) as Array<{ name: string; production: boolean }>;
    expect(schema.length).toBeGreaterThan(40);
    for (const { name } of schema) expect(body).toContain(`| \`${name}\` |`);
    expect(schema.find((entry) => entry.name === "REDIS_URL")?.production).toBe(true);
    expect(body).toMatch(/\| `DATABASE_URL` \| Always \| a URL \| Runtime PostgreSQL URL/);
  });
});

describe("search", () => {
  it("indexes every published page and nothing else", () => {
    expect(SEARCH_INDEX.map((entry) => entry.slug)).toEqual(DOCS.map((doc) => doc.slug));
    expect(DOCS.some((doc) => doc.source.startsWith("docs/plans/"))).toBe(false);
    expect(SEARCH_INDEX.some((entry) => /^\d{4}-\d{2}-\d{2}-/.test(entry.slug))).toBe(false);
  });

  it("ranks a title match first and finds headings", () => {
    expect(searchDocs(SEARCH_INDEX, "backups and restore")[0]?.href).toBe("/docs/backups-and-restore");
    expect(searchDocs(SEARCH_INDEX, "audit action")[0]?.kind).toBe("page");
    expect(searchDocs(SEARCH_INDEX, "screenshots").some((hit) => hit.kind === "heading" && hit.href.includes("#screenshots"))).toBe(true);
    expect(searchDocs(SEARCH_INDEX, "   ")).toEqual([]);
    expect(searchDocs(SEARCH_INDEX, "zzqxj")).toEqual([]);
  });

  it("marks matching text without HTML", () => {
    expect(highlight("Backups and restore", ["back", "restore"])).toEqual([
      { text: "Back", match: true }, { text: "ups and ", match: false }, { text: "restore", match: true },
    ]);
  });
});

describe("article rendering", () => {
  const html = renderToStaticMarkup(createElement(DocsMarkdown, {
    source: "docs/features/units.md",
    body: "Lede.\n\n## Set up\n\n> **Warning:** Back up first.\n\n![Units in the light theme](/screens/units-light.webp)\n\n![Units in the dark theme](/screens/units-dark.webp)\n\n```bash\nbash scripts/backup.sh\n```\n\n[Groupings](groupings.md) and [plans](../plans/x.md).",
  }));

  it("turns quotes into callouts, pairs screenshots by theme and labels code", () => {
    expect(html).toContain('aria-label="Warning"');
    expect(html).toContain("Back up first.");
    expect(html).toMatch(/src="\/screens\/units-light\.webp"[^>]*class="[^"]*dark:hidden/);
    expect(html).toMatch(/src="\/screens\/units-dark\.webp"[^>]*class="[^"]*hidden dark:block/);
    expect(html).toContain(">Bash<");
    expect(html).toContain('aria-label="Copy code"');
  });

  it("renders every published doc, with an id on each heading", () => {
    for (const doc of DOCS) {
      const markup = renderToStaticMarkup(createElement(DocsMarkdown, { body: doc.body, source: doc.source }));
      expect(markup.length, doc.slug).toBeGreaterThan(200);
      expect(markup, doc.slug).not.toMatch(/<h[234](?![^>]*\bid=)[^>]*>/);
    }
  }, 30_000);

  it("anchors headings and filters links", () => {
    expect(html).toContain('id="set-up"');
    expect(html).toContain('href="#set-up"');
    expect(html).toContain('href="/docs/groupings"');
    expect(html).not.toContain("plans/x.md");
  });
});
