"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { invalidateOrg } from "@/lib/cache";
import { orgActionAccess } from "@/lib/permissions";
import { GROUPING_KINDS, VALUE_CODE_PATTERN, normaliseValueCode } from "@/lib/groupings/keys";
import {
  createGrouping, createValue, GroupingError, lockGroupings, moveValue, renameValue, reorderValue, setGroupingArchived, setValueArchived, updateGrouping,
} from "@/lib/groupings/service";
import type { ActionResult } from "./org";
import { flattenZodErrors } from "./utils";

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const slug = z.string().trim().min(1);
const id = z.string().trim().min(1).max(64);
const label = z.string().trim().min(1, "Name the value").max(80, "At most 80 characters");
const code = z.string().trim().optional().transform((value) => (value ? normaliseValueCode(value) : undefined)).refine((value) => value === undefined || VALUE_CODE_PATTERN.test(value), "1 to 12 letters or digits");

/** Who may change groupings: `groupings.manage` (organisation-wide only), rate limited. */
async function groupingAccess(organisationSlug: unknown) {
  const access = await orgActionAccess(organisationSlug, "groupings.manage");
  if (!access.ok) return access;
  if (await isActionRateLimited("action", access.userId)) return { ok: false as const, error: "Too many requests. Try again shortly." };
  return access;
}

type Access = Extract<Awaited<ReturnType<typeof groupingAccess>>, { ok: true }>;

/** Run one grouping change in a locked transaction, audit it, and refresh what reads groupings. */
async function change<T>(input: unknown, schema: z.ZodType<{ organisationSlug: string }, unknown>, audit: string, target: (data: never) => { type: string; id: string | null }, run: (tx: Prisma.TransactionClient, access: Access, data: never) => Promise<T>): Promise<ActionResult<T>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error) };
  const access = await groupingAccess(parsed.data.organisationSlug);
  if (!access.ok) return access;
  const organisationId = access.organisation.id;
  try {
    const data = await prisma.$transaction(async (tx) => {
      await lockGroupings(tx, organisationId);
      const result = await run(tx, access, parsed.data as never);
      const t = target(parsed.data as never);
      await recordAuditEvent({ action: audit, actorUserId: access.userId, organisationId, targetType: t.type, targetId: t.id ?? undefined, client: tx });
      return result;
    });
    revalidatePath(`/dashboard/${access.organisation.slug}/settings/groupings`);
    revalidatePath(`/dashboard/${access.organisation.slug}/members`);
    await invalidateOrg(organisationId, "analytics");
    return { ok: true, data };
  } catch (error) {
    if (error instanceof GroupingError) return { ok: false, error: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, error: "That name or code is already used." };
    throw error;
  }
}

const createSchema = z.object({ organisationSlug: slug, name: z.string().trim().min(2, "Name the grouping").max(60), kind: z.enum(GROUPING_KINDS), multiple: z.boolean().default(false) });

/** Create a grouping ("Profession", "Region"): a list, or a tree of values. */
export async function createOrgGrouping(input: unknown) {
  return change(input, createSchema, "GROUPING_CREATED", () => ({ type: "OrgGrouping", id: null }), (tx, access, data: z.infer<typeof createSchema>) => createGrouping(tx, access.organisation.id, data).then((row) => ({ groupingId: row.id })));
}

const updateSchema = z.object({ organisationSlug: slug, groupingId: id, name: z.string().trim().min(2, "Name the grouping").max(60), multiple: z.boolean() });

export async function updateOrgGrouping(input: unknown) {
  return change(input, updateSchema, "GROUPING_UPDATED", (data: z.infer<typeof updateSchema>) => ({ type: "OrgGrouping", id: data.groupingId }), (tx, access, data: z.infer<typeof updateSchema>) => updateGrouping(tx, access.organisation.id, data.groupingId, data));
}

const archiveSchema = z.object({ organisationSlug: slug, groupingId: id, archived: z.boolean() });

/** Archive a grouping: it leaves the join form and pickers; members keep their values for history. */
export async function setOrgGroupingArchived(input: unknown) {
  return change(input, archiveSchema, "GROUPING_ARCHIVED", (data: z.infer<typeof archiveSchema>) => ({ type: "OrgGrouping", id: data.groupingId }), (tx, access, data: z.infer<typeof archiveSchema>) => setGroupingArchived(tx, access.organisation.id, data.groupingId, data.archived));
}

const valueSchema = z.object({ organisationSlug: slug, groupingId: id, label, parentId: id.nullable().optional().default(null), code });

export async function createGroupingValue(input: unknown) {
  return change(input, valueSchema, "GROUPING_VALUE_CREATED", (data: z.infer<typeof valueSchema>) => ({ type: "OrgGrouping", id: data.groupingId }), (tx, access, data: z.infer<typeof valueSchema>) => createValue(tx, access.organisation.id, data.groupingId, data).then((row) => ({ valueId: row.id })));
}

const renameSchema = z.object({ organisationSlug: slug, valueId: id, label, code });

export async function renameGroupingValue(input: unknown) {
  return change(input, renameSchema, "GROUPING_VALUE_UPDATED", (data: z.infer<typeof renameSchema>) => ({ type: "OrgGroupingValue", id: data.valueId }), (tx, access, data: z.infer<typeof renameSchema>) => renameValue(tx, access.organisation.id, data.valueId, data));
}

const valueArchiveSchema = z.object({ organisationSlug: slug, valueId: id, archived: z.boolean() });

export async function setGroupingValueArchived(input: unknown) {
  return change(input, valueArchiveSchema, "GROUPING_VALUE_ARCHIVED", (data: z.infer<typeof valueArchiveSchema>) => ({ type: "OrgGroupingValue", id: data.valueId }), (tx, access, data: z.infer<typeof valueArchiveSchema>) => setValueArchived(tx, access.organisation.id, data.valueId, data.archived));
}

const moveSchema = z.object({ organisationSlug: slug, valueId: id, parentId: id.nullable() });

/** Move a value, with its subtree, under another value (or to the top) of the same tree. */
export async function moveGroupingValue(input: unknown) {
  return change(input, moveSchema, "GROUPING_VALUE_MOVED", (data: z.infer<typeof moveSchema>) => ({ type: "OrgGroupingValue", id: data.valueId }), (tx, access, data: z.infer<typeof moveSchema>) => moveValue(tx, access.organisation.id, data.valueId, data.parentId));
}

const reorderSchema = z.object({ organisationSlug: slug, valueId: id, direction: z.enum(["up", "down"]) });

export async function reorderGroupingValue(input: unknown) {
  return change(input, reorderSchema, "GROUPING_VALUE_REORDERED", (data: z.infer<typeof reorderSchema>) => ({ type: "OrgGroupingValue", id: data.valueId }), (tx, access, data: z.infer<typeof reorderSchema>) => reorderValue(tx, access.organisation.id, data.valueId, data.direction));
}
