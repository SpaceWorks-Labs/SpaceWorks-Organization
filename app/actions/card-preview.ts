"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { teamScope } from "@/lib/membership/scope";
import { cardDesignerReadAccess, findDesignScope, NOT_FOUND } from "@/lib/cards/designerAccess";
import { loadPreviewHolder, PREVIEW_ORG_SELECT, searchPreviewMembers } from "@/lib/cards/previewMember";
import type { CardHolder } from "@/lib/cards/types";
import type { ActionResult } from "./org";

/*
 * Previewing a card design with a real member, for staff who design cards and read members. Only members
 * inside the viewer's unit and grouping scope are found, and a preview carries only what lib/cards/previewHolder.ts
 * allows (never the member's verify token or their answers).
 */

const PREVIEW_CAPABILITIES = ["cards.design", "members.view"] as const;

export type PreviewMemberOption = { id: string; name: string; unitName: string | null };

const searchSchema = z.object({ organisationSlug: z.string().trim().min(1), query: z.string().max(200) });

/** Members whose name contains the query, at most 20. */
export async function searchCardPreviewMembers(input: unknown): Promise<ActionResult<{ members: PreviewMemberOption[] }>> {
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await cardDesignerReadAccess(parsed.data.organisationSlug, PREVIEW_CAPABILITIES);
  if (!ctx.ok) return ctx;
  const scope = await teamScope(ctx.organisation.id, ctx.membership);
  return { ok: true, data: { members: await searchPreviewMembers(scope, parsed.data.query) } };
}

const holderSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  planId: z.string().trim().min(1).max(64).nullable(),
  roleId: z.string().trim().min(1).max(64).nullable().optional(),
  memberId: z.string().trim().min(1).max(64),
});

/** What the card would print for this member (sample answers, a dummy QR). */
export async function loadCardPreviewHolder(input: unknown): Promise<ActionResult<{ holder: CardHolder }>> {
  const parsed = holderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await cardDesignerReadAccess(parsed.data.organisationSlug, PREVIEW_CAPABILITIES);
  if (!ctx.ok) return ctx;
  const design = await findDesignScope(ctx.organisation.id, parsed.data.planId, parsed.data.roleId ?? null);
  const org = await prisma.organisation.findUnique({ where: { id: ctx.organisation.id }, select: PREVIEW_ORG_SELECT });
  if (!design || !org) return { ok: false, error: NOT_FOUND };
  const holder = await loadPreviewHolder(org, await teamScope(org.id, ctx.membership), parsed.data.memberId, design.plan?.id ?? null);
  return holder ? { ok: true, data: { holder } } : { ok: false, error: NOT_FOUND };
}
