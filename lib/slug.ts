
/** Top-level routes an organisation slug would shadow (`/<orgSlug>`). */
const RESERVED_ORGANISATION_SLUGS: ReadonlySet<string> = new Set([
  "about",
  "account",
  "api",
  "assets",
  "brand",
  "dashboard",
  "features",
  "join",
  "login",
  "members",
  "new",
  "o",
  "org",
  "pay",
  "plans",
  "privacy",
  "public",
  "receipts",
  "reset-password",
  "settings",
  "start",
  "static",
  "super-admin",
  "super-admin-mfa",
  "terms",
  "verify",
  "verify-email",
]);

/** Routes under `/o/<orgSlug>/` a plan slug would shadow. */
const RESERVED_PLAN_SLUGS: ReadonlySet<string> = new Set(["join", "plans", "verify"]);

export function isReservedOrganisationSlug(slug: string) {
  return RESERVED_ORGANISATION_SLUGS.has(slug.trim().toLowerCase());
}

export function isReservedPlanSlug(slug: string) {
  return RESERVED_PLAN_SLUGS.has(slug.trim().toLowerCase());
}
