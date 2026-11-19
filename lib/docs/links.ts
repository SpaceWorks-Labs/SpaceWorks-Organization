import { isSafeLink } from "@/lib/publicPage/sections";
import { DOC_SLUGS } from "./pages";

/** Source file names of the operator docs, so a link such as `GST.md` finds /docs/gst. */
const FILE_SLUGS: Record<string, string> = {
  "ARCHITECTURE.md": "architecture",
  "CONFIGURATION.md": "configuration",
  "DEPLOYMENT_VPS.md": "deployment-vps",
  "DEPLOYMENT_CLOUD.md": "deployment-cloud",
  "DEPLOYMENT_NETLIFY.md": "deployment-netlify",
  "SECURITY.md": "security",
  "PAYMENTS.md": "payments-operators",
  "GST.md": "gst",
  "NOTIFICATIONS.md": "notifications-operators",
  "REPORTS.md": "reports",
};

/**
 * Where a link in a doc may go, or null to show it as plain text. Safe web, mail and phone links pass; `#section`
 * stays on the page; `Other.md#part` and `/docs/<slug>` go to the doc when it is on the allow-list.
 */
export function resolveDocHref(href: string | undefined): string | null {
  if (!href) return null;
  const value = href.trim();
  if (value.startsWith("#")) return /^#[A-Za-z0-9_-]*$/.test(value) ? value : null;
  if (isSafeLink(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//")) return null;
  const hash = value.indexOf("#");
  const path = hash === -1 ? value : value.slice(0, hash);
  const anchor = hash === -1 ? "" : value.slice(hash);
  if (anchor && !/^#[A-Za-z0-9_-]*$/.test(anchor)) return null;
  const direct = /^\/docs\/([a-z0-9-]+)\/?$/.exec(path);
  const name = path.split("/").pop() ?? "";
  const slug = direct?.[1] ?? FILE_SLUGS[name] ?? (name.endsWith(".md") && !path.startsWith("/") ? name.slice(0, -3) : null);
  return slug && DOC_SLUGS.includes(slug) ? `/docs/${slug}${anchor}` : null;
}

/** Images come only from the product's own /screens/ and /brand/ folders. */
export function resolveDocImage(src: string | undefined): string | null {
  if (!src) return null;
  return /^\/(screens|brand)\/[A-Za-z0-9._/-]+$/.test(src) && !src.includes("..") ? src : null;
}
