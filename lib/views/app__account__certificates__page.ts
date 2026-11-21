import { requireAuth } from "@/lib/permissions";
import { listCertificatesForUser } from "@/lib/certificates/portal";

/** The member's own certificates across organisations, found only by the account's verified email (lib/certificates/portal.ts). */
export async function loadAccountCertificatesView() {
  const session = await requireAuth();
  const certificates = await listCertificatesForUser(session.user.id);
  return { certificates: certificates.map((item) => ({ ...item, issuedAt: item.issuedAt.toISOString() })) };
}
