import type { Prisma } from "@prisma/client";
import { MEMBER_FILTERS, type MemberFilter } from "@/lib/membership/describe";
import { memberWhere, type TeamScope } from "@/lib/membership/scope";

/*
 * Which cards a bulk download takes: live cards of the members the directory shows (status chip,
 * plan, unit, role and search), inside the requester's unit scope. The members page passes the filter
 * to /api/exports/cards/<org> as query parameters.
 */

export const CARD_EXPORT_FORMATS = ["sheet", "cards", "zip"] as const;
export type CardExportFormat = (typeof CARD_EXPORT_FORMATS)[number];

export type CardExportFilter = { status: MemberFilter; planId: string | null; unitId: string | null; roleId: string | null; q: string };

const DAY_MS = 86_400_000;
const id = (value: unknown) => (typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null);

export function parseExportFilter(value: unknown): CardExportFilter {
  const input = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    status: (MEMBER_FILTERS as readonly string[]).includes(input.status as string) ? (input.status as MemberFilter) : "all",
    planId: id(input.planId),
    unitId: id(input.unitId),
    roleId: id(input.roleId),
    q: typeof input.q === "string" ? input.q.trim().slice(0, 100) : "",
  };
}

/** A member directory status chip as a member filter. The directory (lib/views) and card downloads share it. */
export function memberFilterWhere(filter: MemberFilter, now: Date): Prisma.MemberWhereInput {
  switch (filter) {
    case "active": return { terms: { some: { status: "ACTIVE" } } };
    case "approval": return { terms: { some: { status: "PENDING_APPROVAL" } } };
    case "payment": return { terms: { some: { status: "PENDING_PAYMENT" } } };
    case "grace": return { terms: { some: { status: "GRACE" } } };
    case "lapsed": return { AND: [{ terms: { some: { status: "LAPSED" } } }, { terms: { none: { status: { in: ["UPCOMING", "ACTIVE", "GRACE"] } } } }] };
    case "expiring": return { terms: { some: { status: "ACTIVE", endsAt: { gte: now, lte: new Date(now.getTime() + 30 * DAY_MS) }, renewals: { none: { status: { notIn: ["CANCELLED", "EXPIRED", "REJECTED"] } } } } } };
    default: return {};
  }
}

/** The cards a bulk download takes. The search matches email only for staff who may see contact details. */
export function exportCardsWhere(scope: TeamScope, filter: CardExportFilter, options: { contact: boolean }, now = new Date()): Prisma.MemberCardWhereInput {
  const q = filter.q;
  return {
    organisationId: scope.organisationId,
    revokedAt: null,
    ...(filter.planId ? { planId: filter.planId } : {}),
    member: {
      AND: [
        memberWhere(scope),
        { anonymisedAt: null },
        memberFilterWhere(filter.status, now),
        ...(q ? [{ OR: [{ name: { contains: q, mode: "insensitive" as const } }, ...(options.contact ? [{ email: { contains: q, mode: "insensitive" as const } }] : []), ...(/^\d{1,9}$/.test(q) ? [{ memberNumber: Number(q) }] : [])] }] : []),
        ...(filter.unitId ? [{ unitId: filter.unitId }] : []),
        ...(filter.roleId ? [{ roles: { some: { roleId: filter.roleId } } }] : []),
      ],
    },
  };
}
