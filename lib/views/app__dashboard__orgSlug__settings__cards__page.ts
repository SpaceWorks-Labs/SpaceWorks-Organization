import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { can, requireOrgCapability } from "@/lib/permissions";
import { memberWhere, teamScope, unitInScope } from "@/lib/membership/scope";
import { deriveCardPrefix } from "@/lib/cards/core";
import { brandingFor, designFor, loadCardOrgContext, loadRoleCardRows, organisationDesignRow, type DesignSource } from "@/lib/cards/data";
import { normalizeCardDesign, withOwnArtwork } from "@/lib/cards/design/presets";
import { draftDiffers, readDraft } from "@/lib/cards/draft";
import { DEFAULT_NUMBER_FORMAT } from "@/lib/cards/numbering";
import { loadCardBrandKit } from "@/lib/cards/brandKitData";

/**
 * The card designer for the organisation default, one plan, one member role or one area (unit): the draft waiting for
 * the owner's approval when there is one, else the live design.
 */
export async function loadOrgCardSettingsView({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ plan?: string; role?: string; unit?: string }> }) {
  const { orgSlug } = await params;
  const { plan: planParam, role: roleParam, unit: unitParam } = await searchParams;
  const { organisation, membership } = await requireOrgCapability(orgSlug, "cards.design");
  const ctx = await loadCardOrgContext(organisation.id);
  if (!ctx) notFound();
  const scope = await teamScope(organisation.id, membership);
  const [plans, roles, rows, cardCount, allUnits] = await Promise.all([
    prisma.membershipPlan.findMany({ where: { organisationId: organisation.id, archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.memberRole.findMany({ where: { organisationId: organisation.id, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.cardDesign.findMany({ where: { organisationId: organisation.id }, select: { planId: true, roleId: true, unitId: true, design: true, draft: true, numberPrefix: true, numberFormat: true, watermarkUrl: true, draftUpdatedAt: true, approvedAt: true } }),
    prisma.memberCard.count({ where: { organisationId: organisation.id, revokedAt: null, member: memberWhere(scope) } }),
    prisma.orgUnit.findMany({ where: { organisationId: organisation.id, archivedAt: null }, orderBy: [{ path: "asc" }], select: { id: true, name: true, code: true, level: true, path: true, parentId: true } }),
  ]);
  // Areas inside the viewer's reach (all of them for organisation-wide staff).
  const units = allUnits.filter((item) => unitInScope(scope, item.path));
  // One scope at a time: a role wins over a plan, a plan over an area.
  const plan = planParam && !roleParam ? plans.find((item) => item.id === planParam) ?? null : null;
  const role = roleParam ? roles.find((item) => item.id === roleParam) ?? null : null;
  const unit = unitParam && !planParam && !roleParam ? units.find((item) => item.id === unitParam) ?? null : null;
  if ((planParam && !roleParam && !plan) || (roleParam && !role) || (unitParam && !planParam && !roleParam && !unit)) notFound();

  const context = { organisationName: ctx.organisation.name, planName: plan?.name ?? "" };
  const row = rows.find((item) => item.planId === (plan?.id ?? null) && item.roleId === (role?.id ?? null) && item.unitId === (unit?.id ?? null));
  const orgRow = organisationDesignRow(ctx);
  // What cards in this scope show today, and so where a new draft starts from.
  const live = plan ? designFor(ctx, plan) : role ? designFor(ctx, { id: "", name: "" }, role.id) : unit ? designFor(ctx, { id: "", name: "" }, null, unit) : null;
  const liveSource: DesignSource = plan || role || unit ? live!.source : orgRow ? "organisation" : "default";
  const own = role ?? unit;
  const liveNumbering = own
    ? { prefix: row?.numberPrefix ?? deriveCardPrefix(own.name), format: row?.numberFormat ?? orgRow?.numberFormat ?? DEFAULT_NUMBER_FORMAT }
    : { prefix: orgRow?.numberPrefix ?? deriveCardPrefix(ctx.organisation.name), format: orgRow?.numberFormat ?? DEFAULT_NUMBER_FORMAT };
  const draft = row ? readDraft(row, context) : null;
  const design = withOwnArtwork(draft?.design ?? live?.design ?? normalizeCardDesign(orgRow?.design, context), ctx.organisation.id);
  // A plan's or role's own questions: a plan's, or every plan's for the organisation and role designs (one entry per key).
  const fields = new Map<string, { key: string; label: string }>();
  for (const field of plan ? ctx.fields.get(plan.id) ?? [] : [...ctx.fields.values()].flat()) {
    if (!fields.has(field.key)) fields.set(field.key, { key: field.key, label: field.label });
  }

  return {
    org: { name: ctx.organisation.name, slug: ctx.organisation.slug, logoUrl: ctx.organisation.logoUrl },
    plans: plans.map((item) => ({ ...item, ownDesign: rows.some((entry) => entry.planId === item.id && entry.design !== null), pending: rows.some((entry) => entry.planId === item.id && draftDiffers(entry, { ...context, planName: item.name })) })),
    roles: roles.map((item) => ({ ...item, ownDesign: rows.some((entry) => entry.roleId === item.id && entry.design !== null), pending: rows.some((entry) => entry.roleId === item.id && draftDiffers(entry, context)) })),
    plan,
    role,
    unit: unit ? { id: unit.id, name: unit.name, code: unit.code, level: unit.level, levelName: ctx.organisation.unitLevels[unit.level] ?? "Unit" } : null,
    /** Areas (units not archived) in the viewer's reach, in tree order: `live` has an approved design, `hasDraft` a draft, `pending` a draft that would change cards. */
    areas: units.map((item) => {
      const entry = rows.find((candidate) => candidate.unitId === item.id);
      return { id: item.id, name: item.name, code: item.code, level: item.level, levelName: ctx.organisation.unitLevels[item.level] ?? "Unit", path: item.path, parentId: item.parentId, live: Boolean(entry?.design), hasDraft: Boolean(entry?.draft), pending: entry ? draftDiffers(entry, context) : false };
    }),
    design,
    branding: brandingFor(ctx, draft ? draft.watermarkUrl : live?.branding.watermarkUrl ?? orgRow?.watermarkUrl ?? null),
    source: liveSource,
    approval: {
      pending: row ? draftDiffers(row, context) : false,
      live: Boolean(row?.design),
      draftUpdatedAt: row?.draft ? row.draftUpdatedAt?.toISOString() ?? null : null,
      approvedAt: row?.approvedAt?.toISOString() ?? null,
      canApprove: can(membership, "cards.approve"),
    },
    fields: [...fields.values()],
    numbering: plan ? null : draft ? { prefix: draft.numberPrefix, format: draft.numberFormat } : liveNumbering,
    cardCount,
    canEdit: can(membership, "cards.design", { write: true }),
    unitLevels: ctx.organisation.unitLevels,
    // Which member roles carry their own card, for the people who design them (counts are organisation-wide).
    roleCards: can(membership, "cards.design", { write: true }) ? await loadRoleCardRows(organisation.id) : [],
    // The brand kit: logos, colours and fonts the designer offers first (brandKitSaved is what the kit editor changes).
    ...(await loadCardBrandKit(organisation.id, ctx.organisation.logoUrl)),
  };
}
