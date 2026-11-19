import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { checkRateLimitById, getClientIpFromHeaders } from "@/lib/rateLimit";
import { isBotUserAgent } from "./bots";
import { recordVisit } from "./record";
import { MAX_VISIT_BODY, parseVisit } from "./route";

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
    const org = await prisma.organisation.findUnique({ where: { slug: visit.orgSlug }, select: { id: true, status: true } });
    if (!org || org.status !== "ACTIVE") return false;
    organisationId = org.id;
  }
  await recordVisit(organisationId, visit.route);
  return true;
}
