import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { jsonError, PRIVATE_HEADERS } from "@/lib/downloads";
import { checkRateLimitById } from "@/lib/rateLimit";
import { can, organisationAllows } from "@/lib/permissionRoles";
import { getMembership, hasAuthenticator, STAFF_AUTHENTICATOR_MESSAGE } from "@/lib/permissions";
import { memberWhere, teamScope } from "@/lib/membership/scope";
import { tryAcquireRenderSlot } from "@/lib/cards/renderSlot";
import { certificateExportLimit, certificatesPdfStream, certificatesZipStream } from "@/lib/certificates/bulk";
import { loadCertificateOrgContext } from "@/lib/certificates/data";

export const dynamic = "force-dynamic";

/**
 * Bulk certificate download of one design, drawn now from its live version and never stored:
 * GET /api/exports/certificates/{orgSlug}?design={designId}&format=zip|pdf. The certificates are the valid ones
 * (revoked ones are left out) of members inside the requester's reach. A ZIP (up to 200) streams one PDF each as
 * it is drawn; the combined PDF (up to 500) has a page each and is drawn in the request. One bulk render runs per
 * server at a time, shared with card downloads; a second gets 429.
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
  if (!organisationAllows(org.status, "certificates.issue") || !can(membership, "certificates.issue")) return jsonError(403, "Your role can't download certificates.");

  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  if (format !== "zip" && format !== "pdf") return jsonError(400, "Choose a file type.");
  const designId = url.searchParams.get("design") ?? "";
  const design = await prisma.certificateDesign.findFirst({ where: { id: designId, organisationId: org.id }, select: { id: true, name: true } });
  if (!design) return jsonError(404, "Not found.");
  if (!(await checkRateLimitById("reportExport", `user:${userId}`))) return jsonError(429, "Too many downloads. Try again later.");

  const where = { organisationId: org.id, designId: design.id, revokedAt: null, member: { AND: [memberWhere(await teamScope(org.id, membership)), { anonymisedAt: null }] } };
  const count = await prisma.certificate.count({ where });
  if (count === 0) return jsonError(404, "No valid certificates of this design to download.");
  const limit = certificateExportLimit(format);
  if (count > limit) return jsonError(400, `${count} certificates match; one download takes up to ${limit}. Download a ZIP in parts, or limit it to one unit.`);
  const ctx = await loadCertificateOrgContext(org.id);
  if (!ctx) return jsonError(404, "Not found.");

  const release = tryAcquireRenderSlot();
  if (!release) return jsonError(429, "Another download is being prepared on this server. Try again in a minute.");
  try {
    await recordAuditEvent({ action: "CERTIFICATE_EXPORT_DOWNLOADED", actorUserId: userId, organisationId: org.id, targetType: "CertificateDesign", targetId: design.id, metadata: { certificates: count, format, scoped: Boolean(membership.unitId) } });
  } catch (error) {
    release();
    throw error;
  }
  const body = format === "zip" ? certificatesZipStream(ctx, where, release) : certificatesPdfStream(ctx, where, release);
  return new Response(body, {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": format === "zip" ? "application/zip" : "application/pdf",
      "Content-Disposition": `attachment; filename="${org.slug}-certificates-${new Date().toISOString().slice(0, 10)}.${format}"`,
      "X-Accel-Buffering": "no",
    },
  });
}
