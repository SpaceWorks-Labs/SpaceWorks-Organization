import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { checkRateLimitById } from "@/lib/rateLimit";
import { localDate } from "@/lib/membership/periods";
import { can, organisationAllows } from "@/lib/permissionRoles";
import { getMembership, hasAuthenticator, STAFF_AUTHENTICATOR_MESSAGE } from "@/lib/permissions";
import { buildReportContext } from "@/lib/reports/context";
import { periodBuckets } from "@/lib/reports/period";
import { loadRefunds, loadTaxDocuments } from "@/lib/reports/finance/source";
import { gstr1 } from "@/lib/reports/finance/gst";
import { table13 } from "@/lib/reports/finance/documents";
import { gstPeriod, gstr1Json } from "@/lib/reports/finance/gstr1Json";

export const dynamic = "force-dynamic";

function refuse(status: number, message: string) {
  return new Response(message, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
}

/**
 * GSTR-1 for one month as JSON for the GST portal's offline tool. The return covers the whole registration,
 * so only organisation-wide finance roles can download it; every download is audited.
 */
export async function GET(request: Request, { params }: { params: Promise<{ orgSlug: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return refuse(401, "Sign in to download GSTR-1.");
  const { orgSlug } = await params;
  const org = await prisma.organisation.findUnique({ where: { slug: orgSlug }, select: { id: true, slug: true, status: true } });
  const membership = org ? await getMembership(userId, org.id) : null;
  if (!org || !membership) return refuse(404, "Not found.");
  if (!(await hasAuthenticator(userId))) return refuse(403, STAFF_AUTHENTICATOR_MESSAGE);
  // `reports.gstr1` is org-wide for any use, so `can` refuses staff limited to one unit.
  if (!organisationAllows(org.status, "reports.gstr1") || !can(membership, "reports.gstr1")) return refuse(403, "Only organisation-wide finance roles can download GSTR-1.");
  if (!(await checkRateLimitById("reportExport", `user:${userId}`))) return refuse(429, "Too many exports. Try again later.");
  const tax = await prisma.orgTaxSettings.findUnique({ where: { organisationId: org.id }, select: { mode: true, gstin: true, stateCode: true } });
  if (tax?.mode !== "GST" || !tax.gstin) return refuse(400, "GSTR-1 needs GST switched on with a GSTIN in Settings → Payments and tax.");

  const search = new URL(request.url).searchParams;
  const ctx = await buildReportContext({ organisation: org, membership, userId }, Object.fromEntries(search));
  const months = periodBuckets(ctx.period, ctx.org.timezone, "month");
  const month = months.find((bucket) => bucket.key === search.get("month")) ?? months.at(-1);
  if (!month) return refuse(400, "Choose a month.");
  const whole = { ...ctx.scope, unitPath: null, unitId: null, planId: null, memberId: undefined };
  const [documents, refunds] = await Promise.all([loadTaxDocuments(whole), loadRefunds(whole)]);
  const supplierState = tax.stateCode ?? ctx.org.stateCode;
  const range = { from: month.from, to: month.to };
  const report = gstr1(documents, refunds, range, supplierState);
  const period = gstPeriod(localDate(month.from, ctx.org.timezone));
  const body = JSON.stringify(gstr1Json(report, { gstin: tax.gstin, period, supplierState, timeZone: ctx.org.timezone, documents: table13(documents, range) }), null, 2);

  await recordAuditEvent({ action: "FINANCE_REPORT_EXPORTED", actorUserId: userId, organisationId: org.id, targetType: "Organisation", targetId: org.id, metadata: { report: "gstr1-json", month: month.key, invoices: report.b2b.length + report.b2cl.length, creditNotes: report.cdnr.length + report.cdnur.length } });
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${org.slug}-gstr1-${period}.json"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
