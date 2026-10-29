import { prisma } from "@/lib/db";
import { requireOrgCapability } from "@/lib/permissions";
import { memberWhere, teamScope, unitInScope, type TeamScope } from "@/lib/membership/scope";
import { money } from "@/lib/membership/describe";
import { localDate } from "@/lib/membership/periods";
import { dayKey } from "@/lib/reports/period";
import { chargeLines, placeOfSupply, resolveTaxSnapshot, sumSplits } from "@/lib/payments/tax";
import { COLLECTION_MAX_ROWS } from "@/lib/payments/collection";

const LIST_LIMIT = 500;

type Props = { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ unit?: string }> };

/**
 * The collection sheet: a unit within the collector's reach and its members (the whole subtree) who owe a fee, with
 * what each owes, ready to tick and record together.
 */
export async function loadCollectionSheet({ params, searchParams }: Props) {
  const { orgSlug } = await params;
  const search = await searchParams;
  const { organisation, membership } = await requireOrgCapability(orgSlug, "payments.manage");
  const organisationId = organisation.id;
  const team = await teamScope(organisationId, membership.unitId);
  const [org, allUnits, tax] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { name: true, slug: true, logoUrl: true, locale: true, timezone: true, unitLevels: true, offlineConfirmationRequired: true } }),
    prisma.orgUnit.findMany({ where: { organisationId, archivedAt: null }, orderBy: { path: "asc" }, select: { id: true, name: true, path: true, level: true } }),
    prisma.orgTaxSettings.findUnique({ where: { organisationId } }),
  ]);
  const units = allUnits.filter((unit) => unitInScope(team, unit.path));
  const chosen = units.find((unit) => unit.id === search.unit) ?? units.find((unit) => unit.id === team.unitId) ?? null;
  const scope: TeamScope = chosen ? { organisationId, unitId: chosen.id, unitPath: chosen.path } : team;

  const terms = await prisma.membershipTerm.findMany({
    where: {
      organisationId,
      member: { ...memberWhere(scope), anonymisedAt: null },
      OR: [{ status: "PENDING_PAYMENT" }, { status: { in: ["UPCOMING", "ACTIVE", "GRACE"] }, plan: { paymentTiming: "ACTIVATE_THEN_CHARGE" } }],
      payments: { none: { status: { in: ["PAID", "WAIVED"] } } },
    },
    orderBy: [{ member: { name: "asc" } }, { createdAt: "asc" }],
    take: LIST_LIMIT + 1,
    select: {
      id: true, kind: true, currency: true, priceMinor: true, joiningFeeMinor: true,
      plan: { select: { name: true } },
      member: { select: { name: true, memberNumber: true, stateCode: true, unit: { select: { name: true } } } },
      payments: { where: { status: "AWAITING_CONFIRMATION" }, select: { id: true }, take: 1 },
    },
  });

  const rows = terms.slice(0, LIST_LIMIT).map((term) => {
    const snapshot = resolveTaxSnapshot(tax, term.currency);
    const due = sumSplits(chargeLines({ renewal: term.kind === "RENEWAL", rejoining: false, priceMinor: term.priceMinor, joiningFeeMinor: term.joiningFeeMinor, planName: term.plan.name }, snapshot, placeOfSupply(term.member.stateCode, snapshot)));
    return {
      termId: term.id,
      name: term.member.name,
      memberNumber: term.member.memberNumber,
      unitName: term.member.unit?.name ?? null,
      planName: term.plan.name,
      amount: money(due.amountMinor, term.currency, org.locale),
      waiting: term.payments.length > 0,
    };
  });

  return {
    org,
    units: units.map((unit) => ({ id: unit.id, name: unit.name, depth: unit.level - (team.unitPath ? team.unitPath.split("/").length - 1 : 0), levelName: org.unitLevels[unit.level] ?? "Unit" })),
    unitId: chosen?.id ?? "",
    unitName: chosen?.name ?? null,
    /** Org-wide staff may list every member; staff for one unit always have a unit chosen. */
    allowWholeOrganisation: !team.unitId,
    rows,
    truncated: terms.length > LIST_LIMIT,
    today: dayKey(localDate(new Date(), org.timezone)),
    maxRows: COLLECTION_MAX_ROWS,
    makerChecker: org.offlineConfirmationRequired,
  };
}

export type CollectionSheetView = Awaited<ReturnType<typeof loadCollectionSheet>>;
