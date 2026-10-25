"use server";

import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { orgActionAccess } from "@/lib/permissions";
import { MAX_CSV_BYTES, parseCsv } from "@/lib/csv";
import { fetchSheetCsv, SheetImportError } from "@/lib/googleSheets";
import { isIndianStateCode } from "@/lib/indianStates";
import { mappingIsUsable, readRow, suggestMapping, type ImportTarget } from "@/lib/membership/importMapping";
import { teamScope, unitInScope } from "@/lib/membership/scope";
import { MembershipError, openTerm, upsertMember } from "@/lib/membership/service";
import { reissueCardsForRoleChange } from "@/lib/cards/issue";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const MAX_IMPORT_ROWS = 2000;

const sourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("csv"), text: z.string().max(MAX_CSV_BYTES, "The file is larger than 2 MB.") }),
  z.object({ kind: z.literal("sheet"), url: z.string().trim().max(2000) }),
]);

async function readSource(source: z.infer<typeof sourceSchema>): Promise<string[][]> {
  const text = source.kind === "csv" ? source.text : await fetchSheetCsv(source.url);
  const rows = parseCsv(text, MAX_IMPORT_ROWS + 1);
  if (rows.length < 2) throw new SheetImportError("We need a header row and at least one member.");
  if (rows.length > MAX_IMPORT_ROWS + 1) throw new SheetImportError(`Import up to ${MAX_IMPORT_ROWS} members at a time.`);
  return rows;
}

function fail(error: unknown): { ok: false; error: string } {
  if (error instanceof SheetImportError) return { ok: false, error: error.message };
  if (error instanceof Error && /rows\.$/.test(error.message)) return { ok: false, error: `Import up to ${MAX_IMPORT_ROWS} members at a time.` };
  throw error;
}

const previewSchema = z.object({ organisationSlug: z.string().trim().min(1), planId: z.string().trim().max(64).optional().nullable(), source: sourceSchema });

/** Read the file or sheet and suggest how its columns map onto member details. Writes nothing. */
export async function previewMemberImport(input: unknown): Promise<ActionResult<{ headers: string[]; sample: string[][]; total: number; mapping: ImportTarget[] }>> {
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const access = await orgActionAccess(parsed.data.organisationSlug, "members.manage");
  if (!access.ok) return access;
  if (await isActionRateLimited("action", access.userId)) return { ok: false, error: "Too many requests. Try again shortly." };
  try {
    const [headers, ...rows] = await readSource(parsed.data.source);
    const fields = parsed.data.planId ? await prisma.planField.findMany({ where: { planId: parsed.data.planId, organisationId: access.organisation.id }, select: { key: true, label: true } }) : [];
    return { ok: true, data: { headers, sample: rows.slice(0, 8), total: rows.length, mapping: suggestMapping(headers, fields) } };
  } catch (error) {
    return fail(error);
  }
}

const commitSchema = previewSchema.extend({
  mapping: z.array(z.string().max(80)).max(200),
  /** Open a membership on the plan for each imported person (a manager's import skips approval). */
  startMemberships: z.boolean().default(false),
});

/**
 * Import members. Existing members (same email) are updated, new ones are numbered in order. Rows that
 * can't be read are skipped and listed, so one bad row never blocks the rest.
 */
export async function commitMemberImport(input: unknown): Promise<ActionResult<{ created: number; updated: number; skipped: Array<{ row: number; reason: string }> }>> {
  const parsed = commitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const access = await orgActionAccess(parsed.data.organisationSlug, "members.manage");
  if (!access.ok) return access;
  if (await isActionRateLimited("upload", access.userId)) return { ok: false, error: "Too many imports. Try again shortly." };
  const mapping = parsed.data.mapping as ImportTarget[];
  const mappingError = mappingIsUsable(mapping);
  if (mappingError) return { ok: false, error: mappingError };

  let rows: string[][];
  try {
    rows = (await readSource(parsed.data.source)).slice(1);
  } catch (error) {
    return fail(error);
  }
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: access.organisation.id }, select: { id: true, slug: true, timezone: true, financialYearStartMonth: true, memberLimit: true } });
  const plan = parsed.data.planId ? await prisma.membershipPlan.findFirst({ where: { id: parsed.data.planId, organisationId: org.id, archivedAt: null } }) : null;
  if (parsed.data.startMemberships && !plan) return { ok: false, error: "Choose the plan to start memberships on." };
  const scope = await teamScope(org.id, access.membership.unitId);
  const units = await prisma.orgUnit.findMany({ where: { organisationId: org.id, archivedAt: null }, select: { id: true, name: true, slug: true, path: true } });
  const roles = await prisma.memberRole.findMany({ where: { organisationId: org.id, archivedAt: null }, select: { id: true, name: true } });
  const unitBy = (text: string) => units.find((unit) => unit.slug === text.toLowerCase() || unit.name.toLowerCase() === text.toLowerCase());

  let created = 0;
  let updated = 0;
  const skipped: Array<{ row: number; reason: string }> = [];
  for (const [index, cells] of rows.entries()) {
    const rowNumber = index + 2;
    const row = readRow(cells, mapping);
    if ("error" in row) {
      skipped.push({ row: rowNumber, reason: row.error });
      continue;
    }
    const unit = row.unit ? unitBy(row.unit) : null;
    if (row.unit && !unit) {
      skipped.push({ row: rowNumber, reason: `No unit called "${row.unit.slice(0, 40)}"` });
      continue;
    }
    if (!unitInScope(scope, unit?.path ?? null)) {
      skipped.push({ row: rowNumber, reason: "Outside your unit" });
      continue;
    }
    const role = row.role ? roles.find((entry) => entry.name.toLowerCase() === row.role!.toLowerCase()) : null;
    try {
      const outcome = await prisma.$transaction(async (tx) => {
        const existing = await tx.member.findUnique({ where: { organisationId_email: { organisationId: org.id, email: row.email } }, select: { id: true } });
        if (!existing && org.memberLimit && (await tx.member.count({ where: { organisationId: org.id } })) >= org.memberLimit) throw new MembershipError("Member limit reached");
        const member = await upsertMember(tx, org.id, {
          name: row.name, email: row.email, phone: row.phone, unitId: unit?.id ?? undefined,
          stateCode: row.stateCode && isIndianStateCode(row.stateCode) ? row.stateCode : null,
          fieldValues: row.fieldValues, source: "IMPORT",
        });
        if (role) {
          const hasPrimary = await tx.memberRoleAssignment.count({ where: { memberId: member.id, isPrimary: true } });
          await tx.memberRoleAssignment.upsert({ where: { memberId_roleId: { memberId: member.id, roleId: role.id } }, create: { organisationId: org.id, memberId: member.id, roleId: role.id, isPrimary: hasPrimary === 0 }, update: {} });
          // A first primary role changes what the member's cards print.
          if (hasPrimary === 0 && (await tx.memberRoleAssignment.count({ where: { memberId: member.id, isPrimary: true } }))) await reissueCardsForRoleChange(tx, org.id, member.id, access.userId);
        }
        if (plan && parsed.data.startMemberships) {
          const live = await tx.membershipTerm.count({ where: { memberId: member.id, planId: plan.id, status: { in: ["PENDING_APPROVAL", "PENDING_PAYMENT", "UPCOMING", "ACTIVE", "GRACE"] } } });
          if (!live) await openTerm(tx, { org, plan, memberId: member.id, byManager: true, actorUserId: access.userId });
        }
        return existing ? "updated" : "created";
      });
      if (outcome === "created") created += 1;
      else updated += 1;
    } catch (error) {
      skipped.push({ row: rowNumber, reason: error instanceof MembershipError ? error.message : "Couldn't be saved" });
    }
  }
  await recordAuditEvent({ action: "MEMBERS_IMPORTED", actorUserId: access.userId, organisationId: org.id, targetType: "Organisation", targetId: org.id, metadata: { created, updated, skipped: skipped.length, source: parsed.data.source.kind } });
  revalidatePath(`/dashboard/${org.slug}/members`);
  return { ok: true, data: { created, updated, skipped: skipped.slice(0, 100) } };
}
