import "server-only";

import { prisma } from "@/lib/db";
import { planOffersUnit } from "@/lib/membership/planUnits";
import { loadAreaEntries } from "./areaData";
import { applyAreaContext, type AreaContext } from "./blockData";
import { loadPublicCounts } from "./counts";
import { newSection } from "./defaults";
import { loadLiveStats, type LiveStatsSettings } from "./liveStats";
import { countsWanted } from "./live";
import { sampleCardFor } from "./sampleCard";
import { loadStoredPage } from "./server";
import type { PageDocument } from "./sections";

/**
 * What every visitor sees on /o/<slug> and /o/<slug>/a/<code>, the same for all of them (cached under the
 * organisation's public-page key by the view loaders). Only the published document is ever read. On an area page the
 * plans are the ones offered to that area, contact blocks take the area's details, the numbers are scoped to the
 * area's subtree, and the organisation-wide live counts are left out (they would sit under an area's name).
 */

type Org = {
  id: string; slug: string; status: string; unitLevels: string[]; timezone: string; financialYearStartMonth: number;
  contactEmail: string | null; contactPhone: string | null; website: string | null;
};
type Scope = { area: AreaContext; path: string } | null;

/**
 * The plain area page for an organisation with no published page: the plans, the sub-areas and the contact, which is
 * the area's own where it (or an area above it) sets one, else the organisation's.
 */
function plainAreaDocument(area: AreaContext): PageDocument {
  const ids = ["plans00001", "areas00001", "contact001"];
  const contact = { contactEmail: area.contact.email, contactPhone: area.contact.phone };
  return { tagline: "", coverAssetKey: null, accentColor: null, sections: [{ ...newSection("plans", ids[0]), title: "Membership" }, { ...newSection("areas", ids[1]), title: `Areas in ${area.name}` }, newSection("contact", ids[2], contact)] };
}

export async function loadPublicContent(org: Org, scope: Scope) {
  const organisationId = org.id;
  const takingMembers = org.status === "ACTIVE";
  const [allPlans, stored] = await Promise.all([
    prisma.membershipPlan.findMany({
      where: { organisationId, archivedAt: null },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true, name: true, slug: true, description: true, currency: true, durationType: true, durationMonths: true, fixedEndDate: true,
        priceNewMinor: true, priceRenewalMinor: true, joiningFeeMinor: true, joinMode: true, allUnits: true,
        units: { select: { unit: { select: { name: true, path: true } } } },
      },
    }),
    loadStoredPage(organisationId),
  ]);
  const plans = scope ? allPlans.filter((plan) => planOffersUnit(plan, plan.units.map((entry) => entry.unit.path), scope.path)) : allPlans;
  const base = stored.published ?? (scope ? plainAreaDocument(scope.area) : null);
  const page = base && applyAreaContext(base, scope?.area ?? null);
  const visible = (type: string) => Boolean(page?.sections.some((section) => section.type === type && section.visible));
  const units = visible("units")
    ? await prisma.orgUnit.findMany({ where: { organisationId, archivedAt: null }, orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true, parentId: true }, take: 500 })
    : [];
  const settings: LiveStatsSettings = { financialYearStartMonth: org.financialYearStartMonth, timezone: org.timezone, unitLevels: org.unitLevels };
  const cardShown = visible("card") || Boolean(page?.sections.some((section) => section.type === "membersPreview" && section.visible && section.showCard));
  const [counts, sampleCard, liveStats, areas] = await Promise.all([
    page && !scope ? loadPublicCounts(organisationId, countsWanted(page)) : null,
    cardShown ? sampleCardFor(org) : null,
    page ? loadLiveStats(organisationId, page, scope?.path ?? null, settings, scope?.area.level ?? null) : null,
    // An area page always lists the areas: its "other areas" links need them.
    visible("areas") || scope ? loadAreaEntries(org, takingMembers) : [],
  ]);
  return { plans, page, units, counts, sampleCard, liveStats, areas };
}
