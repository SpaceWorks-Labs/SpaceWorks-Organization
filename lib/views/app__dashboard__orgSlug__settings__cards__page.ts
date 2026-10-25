import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { can, requireOrgCapability } from "@/lib/permissions";
import { memberWhere, teamScope } from "@/lib/membership/scope";
import { deriveCardPrefix } from "@/lib/cards/core";
import { brandingFor, designFor, loadCardOrgContext, organisationDesignRow, type DesignSource } from "@/lib/cards/data";
import { normalizeCardDesign } from "@/lib/cards/design/presets";
import { DEFAULT_NUMBER_FORMAT } from "@/lib/cards/numbering";

/**
 * The card designer for the organisation default, one plan or one member role, and the requester's
 * recent bulk exports.
 */
export async function loadOrgCardSettingsView({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ plan?: string; role?: string }> }) {
  const { orgSlug } = await params;
  const { plan: planParam, role: roleParam } = await searchParams;
  const { organisation, membership, userId } = await requireOrgCapability(orgSlug, "org.settings");
  const ctx = await loadCardOrgContext(organisation.id);
  if (!ctx) notFound();
  const [plans, roles, exports, cardCount] = await Promise.all([
    prisma.membershipPlan.findMany({ where: { organisationId: organisation.id, archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.memberRole.findMany({ where: { organisationId: organisation.id, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
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

  const orgRow = organisationDesignRow(ctx);
  const roleRow = role ? ctx.designs.find((row) => row.roleId === role.id) : undefined;
  let editing: { design: ReturnType<typeof designFor>["design"]; branding: ReturnType<typeof designFor>["branding"]; source: DesignSource };
  if (plan) editing = designFor(ctx, plan);
  else if (role) editing = { ...designFor(ctx, { id: "", name: "" }, role.id), source: roleRow ? "role" : orgRow ? "organisation" : "default" };
  else editing = { design: normalizeCardDesign(orgRow?.design, { organisationName: ctx.organisation.name, planName: "" }), branding: brandingFor(ctx, orgRow?.watermarkUrl ?? null), source: orgRow ? "organisation" : "default" };
  // A plan's own questions, or every plan's for the organisation and role designs (one entry per key).
  const fields = new Map<string, { key: string; label: string }>();
  for (const field of plan ? ctx.fields.get(plan.id) ?? [] : [...ctx.fields.values()].flat()) {
    if (!fields.has(field.key)) fields.set(field.key, { key: field.key, label: field.label });
  }
  // Role designs number their own cards; a role without one numbers with the organisation.
  const numbering = role
    ? { prefix: roleRow?.numberPrefix ?? deriveCardPrefix(role.name), format: roleRow?.numberFormat ?? orgRow?.numberFormat ?? DEFAULT_NUMBER_FORMAT }
    : { prefix: orgRow?.numberPrefix ?? deriveCardPrefix(ctx.organisation.name), format: orgRow?.numberFormat ?? DEFAULT_NUMBER_FORMAT };

  return {
    org: { name: ctx.organisation.name, slug: ctx.organisation.slug, logoUrl: ctx.organisation.logoUrl },
    plans: plans.map((item) => ({ ...item, ownDesign: ctx.designs.some((row) => row.planId === item.id) })),
    roles: roles.map((item) => ({ ...item, ownDesign: ctx.designs.some((row) => row.roleId === item.id) })),
    plan,
    role,
    design: editing.design,
    branding: editing.branding,
    source: editing.source,
    fields: [...fields.values()],
    numbering: plan ? null : numbering,
    cardCount,
    exports: exports.map(({ storageKey, ...job }) => ({ ...job, downloadable: job.status === "DONE" && Boolean(storageKey) && (!job.expiresAt || job.expiresAt > new Date()) })),
    canEdit: !membership.unitId,
    canExport: can(membership.role, "cards.manage"),
  };
}
