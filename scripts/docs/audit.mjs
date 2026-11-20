// Generates the audit action reference from the code: every action passed to recordAuditEvent,
// recordThrottledAuditEvent, auditEvent.create, an export's `audit: { action }` or the server's admin script.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SOURCE_DIRS = ["lib", "app", "scripts", "docker"];
const OPENERS = /\b(?:recordAuditEvent|recordThrottledAuditEvent)\(|\bauditEvent\.create\(|\baudit:\s*\{/g;
const ADMIN_SCRIPT = /\baudit\("([A-Z][A-Z0-9_]+)"/g;
const LITERAL = /"([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*)"/g;

function walk(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir).sort()) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, files);
    else if (/\.(ts|tsx|mjs|js)$/.test(name) && !/\.test\./.test(name)) files.push(path);
  }
  return files;
}

/** The text of an expression starting at `from`, up to the first `,` or closing bracket at its own depth. */
function expressionAt(text, from) {
  let depth = 0;
  let quote = null;
  for (let index = from; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if ("([{".includes(char)) depth++;
    else if (")]}".includes(char)) { if (depth === 0) return text.slice(from, index); depth--; }
    else if (char === "," && depth === 0) return text.slice(from, index);
  }
  return text.slice(from);
}

/** `MEMBERSHIP_${args.action…}` and `ORGANISATION_${decision.action}` are spelled out from the tables they read. */
function templateFamilies(root) {
  const lifecycle = readFileSync(join(root, "lib", "membership", "lifecycle.ts"), "utf8");
  const transitions = /export const TRANSITIONS = \{([\s\S]*?)\n\}/.exec(lifecycle)?.[1] ?? "";
  const termActions = [...transitions.matchAll(/^\s+(\w+): \[/gm)].map((match) => match[1]).filter((name) => !["markPaid", "extend"].includes(name));
  const review = readFileSync(join(root, "lib", "organisationLifecycle.ts"), "utf8");
  const decisions = /REVIEW_DECISIONS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(review)?.[1] ?? "";
  const reviewActions = [...decisions.matchAll(/\baction: "([A-Z_]+)"/g)].map((match) => match[1]);
  return { MEMBERSHIP_: termActions.map((name) => name.toUpperCase()), ORGANISATION_: reviewActions };
}

/** Every audit action with the files that write it, sorted by name. */
export function collectAuditActions(root) {
  const families = templateFamilies(root);
  const found = new Map();
  const add = (action, file) => {
    const files = found.get(action) ?? new Set();
    files.add(relative(root, file).split(sep).join("/"));
    found.set(action, files);
  };
  for (const file of SOURCE_DIRS.flatMap((dir) => walk(join(root, dir)))) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(ADMIN_SCRIPT)) add(match[1], file);
    for (const opener of text.matchAll(OPENERS)) {
      const call = expressionAt(text, opener.index + opener[0].length);
      for (const key of call.matchAll(/\baction:\s*/g)) {
        const expression = expressionAt(call, key.index + key[0].length);
        for (const literal of expression.matchAll(LITERAL)) add(literal[1], file);
        for (const template of expression.matchAll(/`([A-Z][A-Z0-9_]*_)\$\{/g)) {
          const names = families[template[1]];
          if (!names) throw new Error(`build-docs: teach scripts/docs/audit.mjs the audit action family ${template[1]}* (${relative(root, file)})`);
          for (const name of names) add(`${template[1]}${name}`, file);
        }
      }
    }
  }
  return [...found.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([action, files]) => ({ action, files: [...files].sort() }));
}

/** "MEMBERSHIP_APPROVE" → "Membership approve", as lib/reports/activity.ts labels it. */
export function actionLabel(action) {
  const words = action.toLowerCase().split("_");
  return words.map((word, index) => (index === 0 ? word[0].toUpperCase() + word.slice(1) : word)).join(" ");
}

/** The activity log's categories, read from lib/reports/activity.ts so the two cannot drift. */
export function activityCategories(root) {
  const source = readFileSync(join(root, "lib", "reports", "activity.ts"), "utf8");
  const toTest = (body) => new Function("action", `return ${body};`);
  const categories = [...source.matchAll(/\{ key: "(\w+)", label: "([^"]+)", test: \(action: string\) => (.+?) \},?\s*$/gm)]
    .map((match) => ({ key: match[1], label: match[2], test: toTest(match[3]) }));
  const account = /isAccountSecurityAction = \(action: string\): boolean =>\s*([\s\S]+?);\n/.exec(source);
  if (!categories.length || !account) throw new Error("build-docs: lib/reports/activity.ts changed shape; update scripts/docs/audit.mjs");
  const isAccount = toTest(account[1]);
  return {
    order: [...categories.map(({ key, label }) => ({ key, label })), { key: "account", label: "Account security" }, { key: "other", label: "Other" }],
    categoryOf: (action) => (isAccount(action) ? "account" : categories.find((category) => category.test(action))?.key ?? "other"),
  };
}

export function renderAuditPage(root) {
  const actions = collectAuditActions(root);
  const { order, categoryOf } = activityCategories(root);
  const lines = [
    "# Audit action reference",
    "",
    `Every action Space Works Organization writes to its audit log (${actions.length} in all), grouped the way the activity log groups them.`,
    "",
    "Audit rows hold who did what to which record, never personal details, passwords, links or form answers. Staff with `audit.view` read their organisation's rows in the activity log; account security actions belong to the person and the super admin, never to an organisation's log.",
    "",
    "> **Note:** This page is generated from the code by `scripts/build-docs.mjs`, so it lists exactly the actions the code can write. The label is how the activity log shows the action.",
  ];
  for (const category of order) {
    const rows = actions.filter((entry) => categoryOf(entry.action) === category.key);
    if (!rows.length) continue;
    lines.push("", `## ${category.label}`, "", "| Action | Label | Written in |", "|---|---|---|");
    for (const { action, files } of rows) {
      const where = files.slice(0, 2).map((file) => `\`${file}\``).join(", ") + (files.length > 2 ? ` and ${files.length - 2} more` : "");
      lines.push(`| \`${action}\` | ${actionLabel(action)} | ${where} |`);
    }
  }
  lines.push("", "## Related", "", "- [Security](../SECURITY.md)", "- [How features connect](../reference/feature-interconnections.md)", "- [Owners](../manuals/owners.md)");
  return lines.join("\n");
}
