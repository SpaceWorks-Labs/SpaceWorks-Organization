import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { download, jsonError, slugForFile } from "@/lib/downloads";
import { checkRateLimitById } from "@/lib/rateLimit";
import { can, organisationAllows, type Capability } from "@/lib/permissionRoles";
import { getMembership, hasAuthenticator, STAFF_AUTHENTICATOR_MESSAGE } from "@/lib/permissions";
import { teamScope } from "@/lib/membership/scope";
import { tryAcquireRenderSlot } from "@/lib/cards/renderSlot";
import { loadDraftPreview } from "@/lib/certificates/draftExport";
import { renderCertificate } from "@/lib/certificates/render";

export const dynamic = "force-dynamic";

/**
 * The certificate designer's download of a design as it stands (the saved draft, not yet approved):
 * GET /api/exports/certificate-draft/{orgSlug}?design={designId}&format=pdf|png&member={memberId}. The design is
 * read from the database, never sent by the client. `member` previews with a member inside the viewer's reach
 * (a dummy QR, never their token); otherwise the fictional sample member. Staff with `certificates.design`
 * (and `members.view` for a member); one render per server at a time (busy: 429).
 */
export async function GET(request: Request, { params }: { params: Promise<{ orgSlug: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return jsonError(401, "Sign in to download certificates.");
  const { orgSlug } = await params;
  const org = await prisma.organisation.findUnique({ where: { slug: orgSlug }, select: { id: true, slug: true, status: true } });
  const membership = org ? await getMembership(userId, org.id) : null;
  if (!org || !membership) return jsonError(404, "Not found.");
  if (!(await hasAuthenticator(userId))) return jsonError(403, STAFF_AUTHENTICATOR_MESSAGE);

  const url = new URL(request.url);
  const memberId = url.searchParams.get("member") || null;
  const needs: Capability[] = memberId ? ["certificates.design", "members.view"] : ["certificates.design"];
  if (!needs.every((capability) => organisationAllows(org.status, capability) && can(membership, capability))) return jsonError(403, "Your role can't download certificate designs.");
  const format = url.searchParams.get("format") === "png" ? "png" : "pdf";
  if (!(await checkRateLimitById("cardRender", `user:${userId}`))) return jsonError(429, "Too many downloads. Try again later.");

  const loaded = await loadDraftPreview(org.id, url.searchParams.get("design") ?? "", memberId ? await teamScope(org.id, membership) : null, memberId);
  if (!loaded) return jsonError(404, "Not found.");
  const release = tryAcquireRenderSlot();
  if (!release) return jsonError(429, "Another download is being prepared on this server. Try again in a minute.");
  try {
    const body = await renderCertificate(loaded.input, format, `${loaded.ctx.organisation.name} certificate design (draft)`);
    return download(body, format === "png" ? "image/png" : "application/pdf", `${org.slug}-certificate-draft-${slugForFile(loaded.row.name, "design")}.${format}`);
  } finally {
    release();
  }
}
