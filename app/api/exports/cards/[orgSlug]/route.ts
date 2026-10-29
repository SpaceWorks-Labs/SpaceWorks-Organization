import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { jsonError, PRIVATE_HEADERS } from "@/lib/downloads";
import { checkRateLimitById } from "@/lib/rateLimit";
import { can, organisationAllows } from "@/lib/permissionRoles";
import { getMembership, hasAuthenticator, STAFF_AUTHENTICATOR_MESSAGE } from "@/lib/permissions";
import { teamScope } from "@/lib/membership/scope";
import { cardExportLimit, cardsPdfStream, cardsZipStream } from "@/lib/cards/bulk";
import { loadCardOrgContext } from "@/lib/cards/data";
import { CARD_EXPORT_FORMATS, exportCardsWhere, parseExportFilter, type CardExportFormat } from "@/lib/cards/exportFilter";
import { tryAcquireRenderSlot } from "@/lib/cards/renderSlot";

export const dynamic = "force-dynamic";

/**
 * Bulk card download, drawn now from the live designs and never stored:
 * GET /api/exports/cards/{orgSlug}?format=sheet|cards|zip&status=&plan=&unit=&role=&q= (the members
 * page's filter). The cards are the live cards of the members that filter shows inside the requester's
 * unit scope. A ZIP (up to 300 cards) streams one PDF per card as it is drawn; the combined PDF (up to
 * 1000) is drawn in the request. One bulk render runs per server at a time; a second gets 429.
 */
export async function GET(request: Request, { params }: { params: Promise<{ orgSlug: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return jsonError(401, "Sign in to download cards.");
  const { orgSlug } = await params;
  const org = await prisma.organisation.findUnique({ where: { slug: orgSlug }, select: { id: true, slug: true, status: true } });
  const membership = org ? await getMembership(userId, org.id) : null;
  if (!org || !membership) return jsonError(404, "Not found.");
  if (!(await hasAuthenticator(userId))) return jsonError(403, STAFF_AUTHENTICATOR_MESSAGE);
  if (!organisationAllows(org.status, "cards.manage") || !can(membership, "cards.manage")) return jsonError(403, "Your role can't download cards.");

  const url = new URL(request.url);
  const format = url.searchParams.get("format") as CardExportFormat;
  if (!(CARD_EXPORT_FORMATS as readonly string[]).includes(format)) return jsonError(400, "Choose a file type.");
  if (!(await checkRateLimitById("reportExport", `user:${userId}`))) return jsonError(429, "Too many downloads. Try again later.");
  const filter = parseExportFilter({ status: url.searchParams.get("status") || "all", planId: url.searchParams.get("plan"), unitId: url.searchParams.get("unit"), roleId: url.searchParams.get("role"), q: url.searchParams.get("q") ?? "" });
  const where = exportCardsWhere(await teamScope(org.id, membership.unitId), filter, { contact: can(membership, "members.contact") });
  const count = await prisma.memberCard.count({ where });
  if (count === 0) return jsonError(404, "None of these members has a card yet.");
  const limit = cardExportLimit(format);
  if (count > limit) return jsonError(400, `${count} cards match; one download takes up to ${limit}. Filter by plan, unit or status first.`);
  const ctx = await loadCardOrgContext(org.id);
  if (!ctx) return jsonError(404, "Not found.");

  const release = tryAcquireRenderSlot();
  if (!release) return jsonError(429, "Another card download is being prepared on this server. Try again in a minute.");
  try {
    await recordAuditEvent({ action: "CARD_EXPORT_DOWNLOADED", actorUserId: userId, organisationId: org.id, targetType: "Organisation", targetId: org.id, metadata: { cards: count, format, scoped: Boolean(membership.unitId) } });
  } catch (error) {
    release();
    throw error;
  }
  const body = format === "zip" ? cardsZipStream(ctx, where, release) : cardsPdfStream(ctx, where, format === "sheet" ? "a4" : "card", release);
  const extension = format === "zip" ? "zip" : "pdf";
  return new Response(body, {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": format === "zip" ? "application/zip" : "application/pdf",
      "Content-Disposition": `attachment; filename="${org.slug}-cards-${new Date().toISOString().slice(0, 10)}.${extension}"`,
      "X-Accel-Buffering": "no",
    },
  });
}
