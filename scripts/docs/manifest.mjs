// What /docs publishes and in which order. Only these folders and files are read: never docs/plans or docs/readme.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const SECTIONS = [
  { key: "start", title: "Getting started", blurb: "Your first hour as an organisation owner, a member or the person running the platform, and the words it uses." },
  { key: "features", title: "Feature guides", blurb: "One page per area: what it does, who can use it, how to turn it on or off, and screenshots in both themes." },
  { key: "manuals", title: "User manuals", blurb: "What each role can do and where: owners, managers, treasurers, staff limited to a unit or grouping, members and super admins." },
  { key: "running", title: "Running it yourself", blurb: "Hosting, configuration, backups, updates, security and monitoring for the people who keep the server running." },
  { key: "reference", title: "Reference", blurb: "Lookup tables: audit actions, environment variables, limits, endpoints, how features connect, the changelog and decisions." },
];

/** Folders whose Markdown files are published, each into one section. */
const FOLDERS = [
  ["docs/guides/start", "start"],
  ["docs/features", "features"],
  ["docs/manuals", "manuals"],
  ["docs/guides/hosting", "running"],
  ["docs/reference", "reference"],
];

/** Single files outside those folders: [repository path, slug, section]. Slugs stay stable for old links. */
export const OPERATOR_DOCS = [
  ["docs/ARCHITECTURE.md", "architecture", "running"],
  ["docs/CONFIGURATION.md", "configuration", "running"],
  ["docs/DEPLOYMENT_VPS.md", "deployment-vps", "running"],
  ["docs/DEPLOYMENT_CLOUD.md", "deployment-cloud", "running"],
  ["docs/DEPLOYMENT_NETLIFY.md", "deployment-netlify", "running"],
  ["docs/DEPLOYMENT_CLOUDFLARE.md", "deployment-cloudflare", "running"],
  ["docs/SECURITY.md", "security", "running"],
  ["docs/PAYMENTS.md", "payments-operators", "running"],
  ["docs/NOTIFICATIONS.md", "notifications-operators", "running"],
  ["docs/REPORTS.md", "reports", "reference"],
  ["docs/GST.md", "gst", "reference"],
  ["docs/decisions.md", "decisions", "reference"],
  ["CHANGELOG.md", "changelog", "reference"],
];

/** Reading order inside each section; anything not listed follows, by slug. Features follow lib/features/catalog.ts. */
const ORDER = {
  start: ["quickstart-owner", "quickstart-member", "quickstart-operator", "glossary"],
  manuals: ["owners", "managers", "treasurers", "limited-staff", "members", "super-admins"],
  running: [
    "choose-your-hosting", "deployment-vps", "deployment-cloud", "deployment-netlify", "deployment-cloudflare", "configuration",
    "backups-and-restore", "updates-and-rollback", "security", "monitoring-and-health", "architecture", "payments-operators", "notifications-operators",
  ],
  reference: ["audit-actions", "environment-variables", "limits", "webhooks-and-endpoints", "feature-interconnections", "reports", "gst", "changelog", "decisions"],
};

/** The feature areas in catalogue order, read from lib/features/catalog.ts (the landing page and /features use it too). */
export function catalogSlugs(root) {
  const source = readFileSync(join(root, "lib", "features", "catalog.ts"), "utf8");
  const list = /export const DOCS_SLUGS = \[([\s\S]*?)\] as const/.exec(source)?.[1];
  if (!list) throw new Error("build-docs: DOCS_SLUGS not found in lib/features/catalog.ts");
  return [...list.matchAll(/"([a-z0-9-]+)"/g)].map((match) => match[1]);
}

/** Every published source file: { slug, section, source } with source relative to the repository root. */
export function publishedSources(root) {
  const entries = [];
  for (const [folder, section] of FOLDERS) {
    const dir = join(root, ...folder.split("/"));
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((file) => file.endsWith(".md")).sort()) {
      entries.push({ slug: name.slice(0, -3), section, source: `${folder}/${name}` });
    }
  }
  for (const [source, slug, section] of OPERATOR_DOCS) {
    if (existsSync(join(root, ...source.split("/")))) entries.push({ slug, section, source });
  }
  return entries;
}

export function orderDocs(docs, root) {
  const order = { ...ORDER, features: catalogSlugs(root) };
  const rank = (doc) => {
    const index = (order[doc.section] ?? []).indexOf(doc.slug);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  const sectionRank = (doc) => SECTIONS.findIndex((section) => section.key === doc.section);
  return [...docs].sort((a, b) => sectionRank(a) - sectionRank(b) || rank(a) - rank(b) || a.slug.localeCompare(b.slug));
}
