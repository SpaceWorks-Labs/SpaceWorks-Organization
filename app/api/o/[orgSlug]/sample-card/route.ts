import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFoundResponse, jsonError } from "@/lib/downloads";
import { can } from "@/lib/permissionRoles";
import { getMembership, hasAuthenticator } from "@/lib/permissions";
import { loadStoredPage } from "@/lib/publicPage/server";
import { renderSampleCard } from "@/lib/publicPage/sampleCard";
import { checkRateLimitById, getClientIpFromHeaders } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * The sample member card on an organisation's public page: GET /api/o/{orgSlug}/sample-card?v={version}, a WebP of
 * the front of the organisation's live card design drawn with fictional holder data (lib/publicPage/sampleCard.ts).
 * Anyone may load it while the published page shows a member card section; otherwise only staff who can open the
 * page editor (for its preview). Everything else is the same 404.
 */
export async function GET(request: Request, { params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  if (!/^[a-z0-9-]{1,64}$/.test(orgSlug)) return notFoundResponse();
  if (!(await checkRateLimitById("sampleCard", getClientIpFromHeaders(request.headers)))) return jsonError(429, "Too many requests. Try again later.");
  const org = await prisma.organisation.findUnique({ where: { slug: orgSlug }, select: { id: true, status: true } });
  if (!org || (org.status !== "ACTIVE" && org.status !== "SUSPENDED")) return notFoundResponse();

  const published = (await loadStoredPage(org.id)).published;
  const shown = Boolean(published?.sections.some((section) => section.type === "card" && section.visible));
  if (!shown && !(await isPageEditor(org.id))) return notFoundResponse();

  const body = await renderSampleCard(org.id);
  if (!body) return notFoundResponse();
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": shown ? "public, max-age=3600" : "private, max-age=600",
      "Content-Disposition": "inline",
      "Cross-Origin-Resource-Policy": "same-site",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Staff who can open Settings → Public page (with an authenticator), for the editor's preview. */
async function isPageEditor(organisationId: string) {
  const userId = (await auth())?.user?.id;
  if (!userId) return false;
  const membership = await getMembership(userId, organisationId);
  return Boolean(membership && can(membership, "org.settings") && (await hasAuthenticator(userId)));
}
