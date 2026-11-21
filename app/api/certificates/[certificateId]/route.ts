import { recordThrottledAuditEvent } from "@/lib/audit";
import { authorizeCertificateAccess } from "@/lib/certificates/access";
import { certificateFileBase } from "@/lib/certificates/core";
import { loadCertificateForRender } from "@/lib/certificates/data";
import { renderCertificate } from "@/lib/certificates/render";
import { download, jsonError, notFoundResponse } from "@/lib/downloads";
import { checkRateLimitById } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * One certificate as a one-page PDF or a 300 dpi PNG: GET /api/certificates/{certificateId}?format=pdf|png.
 * Staff who issue certificates (or see contact details) and whose reach includes the member, and the member
 * themself, may download it; anyone else gets 404. A revoked certificate is for the team only. Drawn from the
 * design's live version, never its draft. Every download is audited.
 */
export async function GET(request: Request, { params }: { params: Promise<{ certificateId: string }> }) {
  const { certificateId } = await params;
  const format = new URL(request.url).searchParams.get("format") === "png" ? "png" : "pdf";

  const viewer = await authorizeCertificateAccess(certificateId);
  if (!viewer) return notFoundResponse();
  if (!(await checkRateLimitById("cardRender", `user:${viewer.userId}`))) return jsonError(429, "Too many certificate downloads. Try again later.");
  const loaded = await loadCertificateForRender(certificateId);
  if (!loaded) return notFoundResponse();

  const { certificate } = loaded;
  const body = await renderCertificate(loaded.input, format, `${certificate.title} - ${certificate.member.name}`);
  await recordThrottledAuditEvent({
    action: "CERTIFICATE_DOWNLOADED",
    actorUserId: viewer.userId,
    organisationId: certificate.organisationId,
    targetType: "Certificate",
    targetId: certificate.id,
    metadata: { format, by: viewer.as },
    windowMs: 10 * 60_000,
  });
  return download(body, format === "png" ? "image/png" : "application/pdf", `${certificateFileBase(certificate.certificateNumber, certificate.member.name)}.${format}`);
}
