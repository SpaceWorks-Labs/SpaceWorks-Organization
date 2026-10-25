import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { can, requireOrgCapability } from "@/lib/permissions";
import { memberWhere, teamScope } from "@/lib/membership/scope";
import { deriveCardPrefix } from "@/lib/cards/core";
import { brandingFor, designFor, loadCardOrgContext, organisationDesignRow, type DesignSource } from "@/lib/cards/data";
import { normalizeCardDesign, withOwnArtwork } from "@/lib/cards/design/presets";
import { draftDiffers, readDraft } from "@/lib/cards/draft";
import { DEFAULT_NUMBER_FORMAT } from "@/lib/cards/numbering";

/**
 * The card designer for the organisation default, one plan or one member role: the draft waiting for
 * the owner's approval when there is one, else the live design; and the requester's recent bulk exports.
 */
export async function loadOrgCardSettingsView({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ plan?: string; role?: string }> }) {
  const { orgSlug } = await params;
  const { plan: planParam, role: roleParam } = await searchParams;
  const { organisation, membership, userId } = await requireOrgCapability(orgSlug, "org.settings");
  const ctx = await loadCardOrgContext(organisation.id);
  if (!ctx) notFound();
  const [plans, roles, rows, exports, cardCount] = await Promise.all([
    prisma.membershipPlan.findMany({ where: { organisationId: organisation.id, archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.memberRole.findMany({ where: { organisationId: organisation.id, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.cardDesign.findMany({ where: { organisationId: organisation.id }, select: { planId: true, roleId: true, design: true, draft: true, numberPrefix: true, numberFormat: true, watermarkUrl: true, draftUpdatedAt: true, approvedAt: true } }),
    prisma.cardExportJob.findMany({
      where: { organisationId: organisation.id, requestedById: userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, format: true, status: true, cardCount: true, byteSize: true, error: true, createdAt: true, finishedAt: true, expiresAt: true, storageKey: true },
    }),
    prisma.memberCard.count({ where: { organisationId: organisation.id, revokedAt: null, member: memberWhere(await teamScope(organisation.id, membership.unitId)) } }),
  ]);
  const plan = planParam && !roleParam ? plans.find((item) => item.id === planParam) ?? null : null;
  const role = roleParam ? roles.find((item) => item.id === roleParam) ?? null : null;
  if ((planParam && !roleParam && !plan) || (roleParam && !role)) notFound();

  const context = { organisationName: ctx.organisation.name, planName: plan?.name ?? "" };
  const row = rows.find((item) => item.planId === (plan?.id ?? null) && item.roleId === (role?.id ?? null));
  const orgRow = organisationDesignRow(ctx);
  // What cards in this scope show today, and so where a new draft starts from.
  const live = plan ? designFor(ctx, plan) : role ? designFor(ctx, { id: "", name: "" }, role.id) : null;
  const liveSource: DesignSource = plan || role ? live!.source : orgRow ? "organisation" : "default";
  const liveNumbering = role
    ? { prefix: row?.numberPrefix ?? deriveCardPrefix(role.name), format: row?.numberFormat ?? orgRow?.numberFormat ?? DEFAULT_NUMBER_FORMAT }
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
    design,
    branding: brandingFor(ctx, draft ? draft.watermarkUrl : live?.branding.watermarkUrl ?? orgRow?.watermarkUrl ?? null),
    source: liveSource,
    approval: {
      pending: row ? draftDiffers(row, context) : false,
      live: Boolean(row?.design),
      draftUpdatedAt: row?.draft ? row.draftUpdatedAt?.toISOString() ?? null : null,
      approvedAt: row?.approvedAt?.toISOString() ?? null,
      canApprove: can(membership.role, "cards.approve"),
    },
    fields: [...fields.values()],
    numbering: plan ? null : draft ? { prefix: draft.numberPrefix, format: draft.numberFormat } : liveNumbering,
    cardCount,
    exports: exports.map(({ storageKey, ...job }) => ({ ...job, downloadable: job.status === "DONE" && Boolean(storageKey) && (!job.expiresAt || job.expiresAt > new Date()) })),
    canEdit: !membership.unitId,
    canExport: can(membership.role, "cards.manage"),
  };
}
