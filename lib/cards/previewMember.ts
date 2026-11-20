import "server-only";

import { prisma } from "@/lib/db";
import { deriveStatus } from "@/lib/membership/lifecycle";
import { memberWhere, type TeamScope } from "@/lib/membership/scope";
import { formatValidUntil } from "./core";
import { memberPhotoUrl } from "./imageUrl";
import { PREVIEW_SEARCH_LIMIT, previewHolder, previewPlanId } from "./previewHolder";
import { printableWebsite, type CardHolder } from "./types";
import { pathIds, unitChain, type CardUnitRow } from "./units";

/*
 * Real members for the card designer's preview, always inside the viewer's unit and grouping scope
 * (memberWhere) and never erased ones. See lib/cards/previewHolder.ts for what a preview may show.
 */

const UNIT_SELECT = { id: true, name: true, code: true, level: true, path: true } as const;

/** Members whose name contains `query`, by name, at most 20: id, name and unit name only. */
export async function searchPreviewMembers(scope: TeamScope, query: string) {
  const name = query.trim().slice(0, 80);
  if (!name) return [];
  const rows = await prisma.member.findMany({
    where: { AND: [memberWhere(scope), { anonymisedAt: null, name: { contains: name, mode: "insensitive" } }] },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: PREVIEW_SEARCH_LIMIT,
    select: { id: true, name: true, unit: { select: { name: true } } },
  });
  return rows.map((row) => ({ id: row.id, name: row.name, unitName: row.unit?.name ?? null }));
}

type PreviewOrg = { id: string; timezone: string; unitLevels: string[]; website: string | null; contactEmail: string | null; contactPhone: string | null };

/** The preview holder for one member in scope, or null when they aren't (or were erased). */
export async function loadPreviewHolder(org: PreviewOrg, scope: TeamScope, memberId: string, designPlanId: string | null, now = new Date()): Promise<CardHolder | null> {
  const member = await prisma.member.findFirst({
    where: { AND: [memberWhere(scope), { id: memberId, anonymisedAt: null }] },
    select: {
      id: true, organisationId: true, name: true, photoUrl: true,
      user: { select: { id: true, profileImageUrl: true } },
      unit: { select: UNIT_SELECT },
      roles: { where: { isPrimary: true, role: { archivedAt: null } }, select: { role: { select: { name: true } } } },
      terms: { select: { id: true, planId: true, status: true, startsAt: true, endsAt: true, graceUntil: true, paymentDueBy: true, renewedFromId: true, createdAt: true } },
      cards: { where: { revokedAt: null }, select: { planId: true, cardNumber: true, issuedAt: true } },
    },
  });
  if (!member || member.organisationId !== org.id) return null;
  const planId = previewPlanId(designPlanId, member.cards, member.terms);
  const [plan, fields, ancestors] = await Promise.all([
    planId ? prisma.membershipPlan.findFirst({ where: { id: planId, organisationId: org.id }, select: { name: true } }) : null,
    planId ? prisma.planField.findMany({ where: { organisationId: org.id, planId, adminOnly: false, section: false }, orderBy: { sortOrder: "asc" }, select: { key: true, label: true } }) : [],
    member.unit ? prisma.orgUnit.findMany({ where: { organisationId: org.id, id: { in: pathIds(member.unit.path) } }, select: UNIT_SELECT }) : [],
  ]);
  const current = planId ? deriveStatus(member.terms.filter((term) => term.planId === planId), now).current : null;
  const known = new Map<string, CardUnitRow>(ancestors.map((row) => [row.id, row]));
  return previewHolder({
    name: member.name,
    roleName: member.roles[0]?.role.name ?? null,
    planName: plan?.name ?? null,
    cardNumber: member.cards.find((card) => card.planId === planId)?.cardNumber ?? null,
    validUntil: current?.startsAt ? formatValidUntil(current.endsAt, org.timezone) : null,
    units: unitChain(member.unit, known, org.unitLevels),
    photoUrl: memberPhotoUrl(member),
    contact: { website: printableWebsite(org.website), email: org.contactEmail, phone: org.contactPhone },
    fields,
  });
}

/** The organisation columns a preview holder reads. */
export const PREVIEW_ORG_SELECT = { id: true, timezone: true, unitLevels: true, website: true, contactEmail: true, contactPhone: true } as const;
