import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { checkRateLimitById } from "@/lib/rateLimit";
import { can, organisationAllows } from "@/lib/permissionRoles";
import { getMembership, hasAuthenticator, STAFF_AUTHENTICATOR_MESSAGE } from "@/lib/permissions";
import { toCsvRow } from "@/lib/csv";
import { deriveStatus, TERM_STATUS_LABELS } from "@/lib/membership/lifecycle";
import { formatCalendarDate, lastValidDay } from "@/lib/membership/periods";
import { memberWhere, teamScope } from "@/lib/membership/scope";

export const dynamic = "force-dynamic";

const PAGE = 500;

function refuse(status: number, message: string) {
  return new Response(message, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
}

/**
 * Members as CSV, streamed page by page. One row per member: details, unit, roles, and their current
 * standing on each plan they have held. Limited to the requester's unit when they are unit-scoped.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ orgSlug: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return refuse(401, "Sign in to export members.");
  const { orgSlug } = await params;
  const org = await prisma.organisation.findUnique({ where: { slug: orgSlug }, select: { id: true, slug: true, status: true, timezone: true } });
  const membership = org ? await getMembership(userId, org.id) : null;
  if (!org || !membership) return refuse(404, "Not found.");
  if (!(await hasAuthenticator(userId))) return refuse(403, STAFF_AUTHENTICATOR_MESSAGE);
  if (!organisationAllows(org.status, "members.export") || !can(membership, "members.export")) return refuse(403, "Your role can't export members.");
  if (!(await checkRateLimitById("reportExport", `user:${userId}`))) return refuse(429, "Too many exports. Try again later.");

  const scope = await teamScope(org.id, membership.unitId);
  // Email and phone stay blank for staff who may not see members' contact details.
  const showContact = can(membership, "members.contact");
  const plans = await prisma.membershipPlan.findMany({ where: { organisationId: org.id }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
  const fields = await prisma.planField.findMany({ where: { organisationId: org.id, section: false }, distinct: ["key"], select: { key: true, label: true } });
  const now = new Date();
  await recordAuditEvent({ action: "MEMBERS_EXPORTED", actorUserId: userId, organisationId: org.id, targetType: "Organisation", targetId: org.id, metadata: { scoped: Boolean(scope.unitId) } });

  const header = ["Member number", "Name", "Email", "Phone", "State", "Unit", "Roles", ...plans.flatMap((plan) => [`${plan.name}: status`, `${plan.name}: valid until`]), ...fields.map((field) => field.label), "Joined"];
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(`﻿${toCsvRow(header)}\r\n`));
      let cursor: string | undefined;
      for (;;) {
        const members = await prisma.member.findMany({
          where: { ...memberWhere(scope), anonymisedAt: null },
          orderBy: { id: "asc" },
          take: PAGE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          include: {
            unit: { select: { name: true } },
            roles: { include: { role: { select: { name: true } } }, orderBy: { isPrimary: "desc" } },
            terms: { select: { id: true, planId: true, status: true, startsAt: true, endsAt: true, graceUntil: true, paymentDueBy: true, renewedFromId: true, createdAt: true } },
          },
        });
        for (const member of members) {
          const values = (member.fieldValues ?? {}) as Record<string, unknown>;
          const planCells = plans.flatMap((plan) => {
            const chain = member.terms.filter((term) => term.planId === plan.id);
            if (!chain.length) return ["", ""];
            const standing = deriveStatus(chain, now);
            const end = standing.current?.endsAt;
            return [TERM_STATUS_LABELS[standing.status], end ? formatCalendarDate(lastValidDay(end, org.timezone)) : standing.current?.startsAt ? "Lifetime" : ""];
          });
          const row = [
            member.memberNumber, member.name, showContact ? member.email : "", showContact ? (member.phone ?? "") : "", member.stateCode ?? "", member.unit?.name ?? "",
            member.roles.map((assignment) => assignment.role.name).join("; "),
            ...planCells,
            ...fields.map((field) => values[field.key] ?? ""),
            member.createdAt.toISOString().slice(0, 10),
          ];
          controller.enqueue(encoder.encode(`${toCsvRow(row)}\r\n`));
        }
        if (members.length < PAGE) break;
        cursor = members[members.length - 1].id;
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${org.slug}-members-${now.toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
