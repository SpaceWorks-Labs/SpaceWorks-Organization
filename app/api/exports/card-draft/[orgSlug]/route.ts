import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { download, jsonError, slugForFile } from "@/lib/downloads";
import { checkRateLimitById } from "@/lib/rateLimit";
import { can, organisationAllows, type Capability } from "@/lib/permissionRoles";
import { getMembership, hasAuthenticator, STAFF_AUTHENTICATOR_MESSAGE } from "@/lib/permissions";
import { teamScope } from "@/lib/membership/scope";
import { normalizeBleedMm, PRINT_BLEED_MM } from "@/lib/cards/bleed";
import { loadCardOrgContext } from "@/lib/cards/data";
import { findDesignScope } from "@/lib/cards/designerAccess";
import { exportSampleHolder, isSample, loadDraftForExport, renderDraftExport } from "@/lib/cards/draftExport";
import { loadPreviewHolder } from "@/lib/cards/previewMember";
import { tryAcquireRenderSlot } from "@/lib/cards/renderSlot";

export const dynamic = "force-dynamic";

/**
 * The card designer's downloads, of the design as it stands (the saved draft, not yet approved):
 * GET /api/exports/card-draft/{orgSlug}?plan=&role=&unit=&format=pdf|png&side=front|back&print=1&member=&sample=.
 * The design is read from the database for that scope, never sent by the client. `print=1` adds a 2 mm bleed
 * with crop marks to the PDF. `member` previews with a member inside the viewer's scope (sample answers, a
 * dummy QR); otherwise the sample member. Staff with `cards.design` (and `members.view` for a member); one
 * render per server at a time (busy: 429).
 */
export async function GET(request: Request, { params }: { params: Promise<{ orgSlug: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return jsonError(401, "Sign in to download cards.");
  const { orgSlug } = await params;
  const org = await prisma.organisation.findUnique({ where: { slug: orgSlug }, select: { id: true, slug: true, status: true, timezone: true, unitLevels: true, website: true, contactEmail: true, contactPhone: true } });
  const membership = org ? await getMembership(userId, org.id) : null;
  if (!org || !membership) return jsonError(404, "Not found.");
  if (!(await hasAuthenticator(userId))) return jsonError(403, STAFF_AUTHENTICATOR_MESSAGE);

  const url = new URL(request.url);
  const memberId = url.searchParams.get("member");
  const needs: Capability[] = memberId ? ["cards.design", "members.view"] : ["cards.design"];
  if (!needs.every((capability) => organisationAllows(org.status, capability) && can(membership, capability))) return jsonError(403, "Your role can't download card designs.");
  const format = url.searchParams.get("format") === "png" ? "png" : "pdf";
  const side = url.searchParams.get("side") === "back" ? "back" : "front";
  const sample = url.searchParams.get("sample");
  if (!(await checkRateLimitById("cardRender", `user:${userId}`))) return jsonError(429, "Too many card downloads. Try again later.");

  const scope = await findDesignScope(org.id, url.searchParams.get("plan") || null, url.searchParams.get("role") || null, url.searchParams.get("unit") || null);
  const ctx = scope ? await loadCardOrgContext(org.id) : null;
  if (!scope || !ctx) return jsonError(404, "Not found.");
  const { design, branding, numbering } = await loadDraftForExport(ctx, scope);
  const holder = memberId
    ? await loadPreviewHolder(org, await teamScope(org.id, membership), memberId, scope.plan?.id ?? null)
    : exportSampleHolder(ctx, scope, numbering, isSample(sample) ? sample : "latin");
  if (!holder) return jsonError(404, "Not found.");

  const release = tryAcquireRenderSlot();
  if (!release) return jsonError(429, "Another card download is being prepared on this server. Try again in a minute.");
  try {
    const bleedMm = format === "pdf" && url.searchParams.get("print") === "1" ? normalizeBleedMm(PRINT_BLEED_MM) : 0;
    const body = await renderDraftExport(design, branding, holder, { format, side, bleedMm, title: `${ctx.organisation.name} card design (draft)` });
    const name = `${org.slug}-card-draft${scope.plan ? `-${slugForFile(scope.plan.name, "plan")}` : scope.role ? `-${slugForFile(scope.role.name, "role")}` : scope.unit ? `-${slugForFile(scope.unit.name, "area")}` : ""}${format === "png" ? `-${side}` : bleedMm ? "-print" : ""}.${format}`;
    return download(body, format === "png" ? "image/png" : "application/pdf", name);
  } finally {
    release();
  }
}
