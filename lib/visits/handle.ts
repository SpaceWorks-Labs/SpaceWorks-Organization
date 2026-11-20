import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { checkRateLimitById, getClientIpFromHeaders } from "@/lib/rateLimit";
import { isBotUserAgent } from "./bots";
import { recordVisit } from "./record";
import { MAX_VISIT_BODY, parseVisit } from "./route";

const SLUG_TTL_MS = 5 * 60_000;
const UNKNOWN_SLUG_TTL_MS = 60_000;
const SLUG_CACHE_SIZE = 500;
const slugCache = new Map<string, { id: string | null; until: number }>();

/** An active organisation's id for a slug, kept in this process for a few minutes (the counts themselves are never cached). */
async function activeOrganisationId(slug: string): Promise<string | null> {
  const hit = slugCache.get(slug);
  if (hit && hit.until > Date.now()) return hit.id;
  const org = await prisma.organisation.findUnique({ where: { slug }, select: { id: true, status: true } });
  const id = org?.status === "ACTIVE" ? org.id : null;
  slugCache.delete(slug);
  slugCache.set(slug, { id, until: Date.now() + (id ? SLUG_TTL_MS : UNKNOWN_SLUG_TTL_MS) });
  if (slugCache.size > SLUG_CACHE_SIZE) slugCache.delete(slugCache.keys().next().value as string);
  return id;
}

/**
 * Count one public page view if it is an approved template, from a plausible browser, within the per-address
 * limit. Returns whether it counted; the route answers 204 either way so nothing leaks. The address is hashed
 * for the limiter key only and never stored.
 */
export async function handleVisit(request: Request): Promise<boolean> {
  if (isBotUserAgent(request.headers.get("user-agent"))) return false;
  const body = await request.text();
  if (body.length > MAX_VISIT_BODY) return false;
  const visit = parseVisit(body);
  if (!visit) return false;
  const subject = createHash("sha256").update(getClientIpFromHeaders(request.headers)).digest("hex").slice(0, 32);
  if (!(await checkRateLimitById("apiRead", `visit:${subject}`))) return false;
  let organisationId: string | null = null;
  if (visit.orgSlug) {
    organisationId = await activeOrganisationId(visit.orgSlug);
    if (!organisationId) return false;
  }
  await recordVisit(organisationId, visit.route);
  return true;
}
