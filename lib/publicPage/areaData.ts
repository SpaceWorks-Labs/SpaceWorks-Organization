import "server-only";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { planOffersUnit } from "@/lib/membership/planUnits";
import { contactFor, unitChainNearestFirst } from "@/lib/units/contact";
import { areaContact, type AreaContext, type AreaEntry } from "./blockData";

/**
 * The areas of an organisation for its public pages: the directory entries (each with the contact it inherits and the
 * open plans it offers) and the one area an area page is for. Contact details and names only, never members.
 * Archived areas are not listed and have no page.
 */

const MAX_UNITS = 500;
const unitSelect = { id: true, code: true, name: true, level: true, parentId: true, path: true, sortOrder: true, contactEmail: true, contactPhone: true, website: true } as const;

type Org = { id: string; slug: string; unitLevels: string[]; contactEmail: string | null; contactPhone: string | null; website: string | null };

const orgContact = (org: Org) => ({ contactEmail: org.contactEmail, contactPhone: org.contactPhone, website: org.website });

export const areaPageHref = (orgSlug: string, code: string) => `/o/${orgSlug}/a/${code}`;

export function loadAreaRows(organisationId: string) {
  return prisma.orgUnit.findMany({ where: { organisationId, archivedAt: null }, orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }], select: unitSelect, take: MAX_UNITS });
}

/** Plans a visitor could join from the page, with the unit paths they are limited to. */
export function loadJoinablePlans(organisationId: string) {
  return prisma.membershipPlan.findMany({
    where: { organisationId, archivedAt: null, joinMode: { in: ["OPEN", "APPROVAL"] } },
    orderBy: { sortOrder: "asc" },
    select: { slug: true, allUnits: true, units: { select: { unit: { select: { path: true } } } } },
  });
}

/** Every area as a directory entry, in tree order. `takingMembers` false leaves every join list empty. */
export async function loadAreaEntries(org: Org, takingMembers: boolean): Promise<AreaEntry[]> {
  const [units, plans] = await Promise.all([loadAreaRows(org.id), takingMembers ? loadJoinablePlans(org.id) : Promise.resolve([])]);
  return units.map((unit) => ({
    id: unit.id, code: unit.code, name: unit.name, level: unit.level, levelLabel: org.unitLevels[unit.level] ?? "", parentId: unit.parentId, path: unit.path,
    contact: areaContact(unit, units, orgContact(org)),
    joinPlans: plans.filter((plan) => planOffersUnit(plan, plan.units.map((entry) => entry.unit.path), unit.path)).map((plan) => plan.slug),
    pageHref: areaPageHref(org.slug, unit.code),
  }));
}

/**
 * The area for `/o/<org>/a/<code>`, or a 404: unknown codes, archived areas and codes of another organisation all
 * look the same. The code is case-insensitive (join links use upper case).
 */
export async function resolveArea(org: Org, code: string): Promise<{ area: AreaContext; path: string }> {
  const wanted = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,6}$/.test(wanted)) notFound();
  const units = await loadAreaRows(org.id);
  const unit = units.find((one) => one.code === wanted);
  if (!unit) notFound();
  const chain = unitChainNearestFirst(unit, units);
  const trail = [...chain].reverse().map((one) => ({ name: one.name, code: one.code, pageHref: areaPageHref(org.slug, one.code) }));
  const own = contactFor(chain, orgContact(org));
  return {
    path: unit.path,
    area: { id: unit.id, code: unit.code, name: unit.name, level: unit.level, levelLabel: org.unitLevels[unit.level] ?? "", path: unit.path, contact: own, ownContact: contactFor(chain, {}), trail },
  };
}
