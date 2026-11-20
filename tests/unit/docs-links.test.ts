import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DOCS, DOC_SCREENS } from "@/lib/docs/content";
import { extractHeadings } from "@/lib/docs/headings";
import { resolveDocHref, resolveDocImage } from "@/lib/docs/links";

/** Link checker over every published doc: no internal link may be broken. */
const root = join(import.meta.dirname, "../..");
const REPO_BLOB = "https://github.com/SpaceWorks-Labs/SpaceWorks-Organization/blob/dev/";

function links(body: string) {
  const prose = body.replace(/^```[\s\S]*?^```/gm, "").replace(/`[^`\n]*`/g, "");
  return {
    links: [...prose.matchAll(/(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((match) => match[1]),
    images: [...prose.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((match) => match[1]),
  };
}

const anchors = new Map(DOCS.map((doc) => [doc.slug, new Set(extractHeadings(doc.body).map((heading) => heading.id))]));

describe("docs links", () => {
  for (const doc of DOCS) {
    it(`${doc.slug}: every link and image resolves`, () => {
      const broken: string[] = [];
      const found = links(doc.body);
      for (const href of found.links) {
        const resolved = resolveDocHref(href, doc.source);
        if (!resolved) { broken.push(`${href} (not allowed)`); continue; }
        const [path, anchor] = resolved.split("#");
        if (resolved.startsWith("#") && !anchors.get(doc.slug)?.has(anchor)) broken.push(`${href} (no such heading)`);
        else if (path.startsWith("/docs/")) {
          const target = path.slice("/docs/".length);
          if (!anchors.has(target)) broken.push(`${href} (no such page)`);
          else if (anchor && !anchors.get(target)?.has(anchor)) broken.push(`${href} (no heading #${anchor} in ${target})`);
        } else if (path.startsWith(REPO_BLOB) && !existsSync(join(root, ...path.slice(REPO_BLOB.length).split("/")))) {
          broken.push(`${href} (no such file in the repository)`);
        }
      }
      for (const src of found.images) {
        const safe = resolveDocImage(src);
        if (!safe) broken.push(`${src} (image not allowed)`);
      }
      expect(broken).toEqual([]);
    });
  }

  it("only names screenshots that ship, apart from the feature guides' pairs still to be captured", () => {
    const missing = DOCS.flatMap((doc) => links(doc.body).images)
      .filter((src) => src.startsWith("/screens/") && !DOC_SCREENS.includes(src))
      .filter((src) => !DOCS.some((doc) => doc.section === "features" && src.startsWith(`/screens/${doc.slug}-`)));
    expect(missing).toEqual([]);
  });
});
