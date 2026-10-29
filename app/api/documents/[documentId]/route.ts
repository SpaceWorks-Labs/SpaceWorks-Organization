import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can, organisationAllows } from "@/lib/permissionRoles";
import { getMembership, hasAuthenticator } from "@/lib/permissions";
import { checkRateLimitById } from "@/lib/rateLimit";
import { memberWhere, teamScope } from "@/lib/membership/scope";
import type { DocumentSnapshot } from "@/lib/payments/documents";
import { renderDocumentPdf } from "@/lib/payments/pdf";

export const dynamic = "force-dynamic";

function refuse(status: number, message: string) {
  return new Response(message, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
}

/**
 * A receipt, tax invoice, bill of supply or credit note as PDF, rendered from its frozen snapshot.
 * Open to the organisation's finance team (within their unit scope) and to the member it was issued to.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return refuse(401, "Sign in to download documents.");
  if (!(await checkRateLimitById("documentView", `user:${userId}`))) return refuse(429, "Too many downloads. Try again later.");
  const { documentId } = await params;
  if (!/^[a-z0-9]{10,40}$/i.test(documentId)) return refuse(404, "Not found.");
  const document = await prisma.taxDocument.findUnique({ where: { id: documentId }, select: { organisationId: true, number: true, snapshot: true, payment: { select: { memberId: true, member: { select: { email: true } } } } } });
  if (!document?.payment) return refuse(404, "Not found.");

  let allowed = false;
  const membership = await getMembership(userId, document.organisationId);
  // Team access needs the staff authenticator; a member downloading their own receipt does not.
  if (membership && (await hasAuthenticator(userId))) {
    const org = await prisma.organisation.findUniqueOrThrow({ where: { id: document.organisationId }, select: { status: true } });
    if (organisationAllows(org.status, "payments.view") && can(membership, "payments.view")) {
      const scope = await teamScope(document.organisationId, membership.unitId);
      allowed = (await prisma.member.count({ where: { ...memberWhere(scope), id: document.payment.memberId } })) > 0;
    }
  }
  if (!allowed) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } });
    allowed = Boolean(user?.email && user.emailVerified && user.email.toLowerCase() === document.payment.member.email);
  }
  if (!allowed) return refuse(404, "Not found.");

  const pdf = await renderDocumentPdf(document.snapshot as unknown as DocumentSnapshot);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${document.number.replace(/[^A-Za-z0-9-]/g, "")}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
