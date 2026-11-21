"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizeCardDesign, withOwnArtwork, type CardDesign } from "@/lib/cards/design/presets";
import { cardDesignerReadAccess, findDesignScope, NOT_FOUND } from "@/lib/cards/designerAccess";
import { CARD_VERSION_LIMIT, isCardVersionKind, type CardVersionKind } from "@/lib/cards/versionPolicy";
import type { ActionResult } from "./org";

/*
 * Version history of one card design (the organisation default, a plan's, a role's or an area's), for the designer's
 * "Version history" dialog. Reading needs `cards.design`; restoring is the designer saving the version as its
 * draft, so the owner still approves it before it reaches members' cards.
 */

export type CardVersionEntry = { id: string; kind: CardVersionKind; createdAt: string; createdBy: string | null };

const scopeSchema = {
  organisationSlug: z.string().trim().min(1),
  planId: z.string().trim().min(1).max(64).nullable(),
  roleId: z.string().trim().min(1).max(64).nullable().optional(),
  unitId: z.string().trim().min(1).max(64).nullable().optional(),
};

async function designFor(input: { organisationSlug: string; planId: string | null; roleId?: string | null; unitId?: string | null }) {
  const ctx = await cardDesignerReadAccess(input.organisationSlug, ["cards.design"]);
  if (!ctx.ok) return ctx;
  const scope = await findDesignScope(ctx.organisation.id, input.planId, input.roleId ?? null, input.unitId ?? null);
  if (!scope) return { ok: false as const, error: NOT_FOUND };
  const row = await prisma.cardDesign.findFirst({ where: scope.where, select: { id: true } });
  return { ok: true as const, ctx, scope, row };
}

/** The design's saved versions, newest first: who saved each, when, and whether it was approved. */
export async function listCardDesignVersions(input: unknown): Promise<ActionResult<{ versions: CardVersionEntry[] }>> {
  const parsed = z.object(scopeSchema).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const found = await designFor(parsed.data);
  if (!found.ok) return found;
  if (!found.row) return { ok: true, data: { versions: [] } };
  const rows = await prisma.cardDesignVersion.findMany({
    where: { organisationId: found.ctx.organisation.id, cardDesignId: found.row.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: CARD_VERSION_LIMIT,
    select: { id: true, kind: true, createdAt: true, createdById: true },
  });
  const ids = [...new Set(rows.flatMap((row) => (row.createdById ? [row.createdById] : [])))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const names = new Map(users.map((user) => [user.id, user.name?.trim() || null]));
  return {
    ok: true,
    data: { versions: rows.map((row) => ({ id: row.id, kind: isCardVersionKind(row.kind) ? row.kind : "DRAFT", createdAt: row.createdAt.toISOString(), createdBy: row.createdById ? names.get(row.createdById) ?? null : null })) },
  };
}

/** One version's design, normalised and limited to the organisation's own artwork, to preview or restore. */
export async function getCardDesignVersion(input: unknown): Promise<ActionResult<{ design: CardDesign }>> {
  const parsed = z.object({ ...scopeSchema, versionId: z.string().trim().min(1).max(64) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const found = await designFor(parsed.data);
  if (!found.ok) return found;
  if (!found.row) return { ok: false, error: NOT_FOUND };
  const organisationId = found.ctx.organisation.id;
  const version = await prisma.cardDesignVersion.findFirst({ where: { id: parsed.data.versionId, organisationId, cardDesignId: found.row.id }, select: { design: true } });
  if (!version) return { ok: false, error: NOT_FOUND };
  const context = { organisationName: found.ctx.organisation.name, planName: found.scope.plan?.name ?? "" };
  return { ok: true, data: { design: withOwnArtwork(normalizeCardDesign(version.design, context), organisationId) } };
}
