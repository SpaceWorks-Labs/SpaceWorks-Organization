import { isSafeLink } from "@/lib/publicPage/sections";
import { GITHUB_URL } from "@/lib/openSource";
import { DOCS } from "./content";

const ANCHOR = /^#[A-Za-z0-9_-]*$/;

/** Resolve `../a/./b.md` against the folder of a repository path; null when it climbs out of the repository. */
export function resolvePath(fromSource: string, target: string): string | null {
  const parts = fromSource.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (part === "..") { if (!parts.length) return null; parts.pop(); }
    else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}

/**
 * Where a link written in a doc may go, or null to show it as plain text. Safe web, mail and phone links pass;
 * `#section` stays on the page; a relative link to a published doc (`../GST.md#rates`) or `/docs/<slug>` opens it
 * here; a relative link to any other repository file opens it on GitHub. Plans and unsafe schemes never link.
 * `fromSource` is the repository path of the doc the link is in (its folder anchors relative links).
 */
export function resolveDocHref(href: string | undefined, fromSource = "docs/index.md"): string | null {
  if (!href) return null;
  const value = href.trim();
  if (value.startsWith("#")) return ANCHOR.test(value) ? value : null;
  if (isSafeLink(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//")) return null;
  const hash = value.indexOf("#");
  const path = hash === -1 ? value : value.slice(0, hash);
  const anchor = hash === -1 ? "" : value.slice(hash);
  if (anchor && !ANCHOR.test(anchor)) return null;
  if (path === "/docs" || path === "/docs/") return `/docs${anchor}`;
  const direct = /^\/docs\/([a-z0-9-]+)\/?$/.exec(path);
  if (direct) return DOCS.some((doc) => doc.slug === direct[1]) ? `/docs/${direct[1]}${anchor}` : null;
  if (path.startsWith("/") || !/^[A-Za-z0-9._/-]+$/.test(path)) return null;
  const target = resolvePath(fromSource, path);
  if (!target || target.startsWith("docs/plans/") || target === "docs/plans") return null;
  const doc = DOCS.find((entry) => entry.source === target);
  if (doc) return `/docs/${doc.slug}${anchor}`;
  return `${GITHUB_URL}/blob/dev/${target}${anchor}`;
}

/** Images come only from the product's own /screens/ and /brand/ folders. */
export function resolveDocImage(src: string | undefined): string | null {
  if (!src) return null;
  return /^\/(screens|brand)\/[A-Za-z0-9._/-]+$/.test(src) && !src.includes("..") ? src : null;
}
