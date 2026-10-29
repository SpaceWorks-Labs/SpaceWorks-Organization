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
import { checkImportRows, type RowProblem } from "@/lib/membership/importRows";
import { queueVerificationAlerts } from "@/lib/membership/importAlerts";
import { teamScope, unitInScope } from "@/lib/membership/scope";
import { planOffersUnit } from "@/lib/membership/planUnits";
import { MembershipError, openTerm, upsertMember } from "@/lib/membership/service";
import { lockMemberByEmail } from "@/lib/membership/memberLock";
import { importAnswers } from "@/lib/membership/importAnswers";
import { organisationQuestionPlans } from "@/lib/membership/questionPlans";
import type { QuestionPlan } from "@/lib/membership/planAnswers";
import { reissueCardsForRoleChange } from "@/lib/cards/issue";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const MAX_IMPORT_ROWS = 2000;
const questionKeys = (plans: QuestionPlan[]) => new Set(plans.flatMap((plan) => plan.fields.filter((field) => !field.section).map((field) => field.key)));

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

const previewSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  planId: z.string().trim().max(64).optional().nullable(),
  source: sourceSchema,
  /** The columns as matched so far; without it the preview suggests a match from the headers. */
  mapping: z.array(z.string().max(80)).max(200).optional(),
});

/**
 * The units and roles rows may name, the importer's reach and where the file's existing members sit (a row
 * without a unit keeps the member's own, which decides the importer's reach and the roles it may give), plus
 * every plan's questions and those members' stored answers.
 */
async function importContext(organisationId: string, unitId: string | null, rows: string[][], mapping: ImportTarget[], plans: QuestionPlan[]) {
  const scope = await teamScope(organisationId, unitId);
  const emails = rows.flatMap((cells) => {
    const row = readRow(cells, mapping);
    return "error" in row ? [] : [row.email];
  });
  const [units, roles, existing] = await Promise.all([
    prisma.orgUnit.findMany({ where: { organisationId, archivedAt: null }, select: { id: true, name: true, slug: true, code: true, path: true } }),
    prisma.memberRole.findMany({ where: { organisationId, archivedAt: null }, select: { id: true, name: true, unit: { select: { path: true } } } }),
    emails.length ? prisma.member.findMany({ where: { organisationId, email: { in: emails } }, select: { email: true, fieldValues: true, unit: { select: { path: true } } } }) : [],
  ]);
  return {
    scope,
    units,
    roles: roles.map((role) => ({ id: role.id, name: role.name, unitPath: role.unit?.path ?? null })),
    scopePath: scope.unitPath,
    existing: new Map(existing.map((member) => [member.email, member.unit?.path ?? null] as const)),
    answers: { plans, stored: new Map(existing.map((member) => [member.email, member.fieldValues as Record<string, unknown>] as const)) },
  };
}

type Preview = { headers: string[]; sample: string[][]; total: number; mapping: ImportTarget[]; ready: number; problems: RowProblem[]; mappingError: string | null };

/**
 * Read the file or sheet, match its columns (as given, or suggested from the headers) and check every row the
 * way the import will: rows with a problem are listed by row number and will be skipped. Writes nothing.
 */
export async function previewMemberImport(input: unknown): Promise<ActionResult<Preview>> {
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const access = await orgActionAccess(parsed.data.organisationSlug, "members.manage");
  if (!access.ok) return access;
  if (await isActionRateLimited("action", access.userId)) return { ok: false, error: "Too many requests. Try again shortly." };
  try {
    const [headers, ...rows] = await readSource(parsed.data.source);
    const plans = await organisationQuestionPlans(access.organisation.id);
    const fields = plans.find((plan) => plan.id === parsed.data.planId)?.fields.filter((field) => !field.section) ?? [];
    const mapping = parsed.data.mapping?.length === headers.length ? (parsed.data.mapping as ImportTarget[]) : suggestMapping(headers, fields);
    const mappingError = mappingIsUsable(mapping, questionKeys(plans));
    const checked = mappingError ? null : checkImportRows(rows, mapping, await importContext(access.organisation.id, access.membership.unitId, rows, mapping, plans));
    return { ok: true, data: { headers, sample: rows.slice(0, 8), total: rows.length, mapping, ready: checked?.ready.length ?? 0, problems: checked?.problems.slice(0, 200) ?? [], mappingError } };
  } catch (error) {
    return fail(error);
  }
}

const commitSchema = previewSchema.extend({
  mapping: z.array(z.string().max(80)).max(200),
  /**
   * What happens on the plan for each imported person: nothing, a membership started now (a manager's import
   * skips approval), or a membership waiting for their unit's lead to verify.
   */
  membership: z.enum(["none", "start", "verify"]).default("none"),
});

type CommitResult = { created: number; updated: number; waiting: number; skipped: RowProblem[] };

/**
 * Import members. Existing members (same email) are updated, new ones are numbered in order. Rows the preview
 * flags are skipped and listed, so one bad row never blocks the rest. Members sent to be verified wait in their
 * unit, and the staff who can verify them get one email for the whole import.
 */
export async function commitMemberImport(input: unknown): Promise<ActionResult<CommitResult>> {
  const parsed = commitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const access = await orgActionAccess(parsed.data.organisationSlug, "members.manage");
  if (!access.ok) return access;
  if (await isActionRateLimited("upload", access.userId)) return { ok: false, error: "Too many imports. Try again shortly." };
  const mapping = parsed.data.mapping as ImportTarget[];
  const plans = await organisationQuestionPlans(access.organisation.id);
  const mappingError = mappingIsUsable(mapping, questionKeys(plans));
  if (mappingError) return { ok: false, error: mappingError };

  let rows: string[][];
  try {
    rows = (await readSource(parsed.data.source)).slice(1);
  } catch (error) {
    return fail(error);
  }
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: access.organisation.id }, select: { id: true, slug: true, timezone: true, financialYearStartMonth: true, memberLimit: true } });
  const plan = parsed.data.planId ? await prisma.membershipPlan.findFirst({ where: { id: parsed.data.planId, organisationId: org.id, archivedAt: null }, include: { units: { select: { unit: { select: { path: true } } } } } }) : null;
  const mode = parsed.data.membership;
  if (mode !== "none" && !plan) return { ok: false, error: mode === "verify" ? "Choose the plan the members are verified for." : "Choose the plan to start memberships on." };
  const context = await importContext(org.id, access.membership.unitId, rows, mapping, plans);
  const { ready, problems } = checkImportRows(rows, mapping, context);

  let created = 0;
  let updated = 0;
  const skipped: RowProblem[] = [...problems];
  // Unit paths of the members left waiting for verification, one per member.
  const waiting: Array<string | null> = [];
  for (const { rowNumber, row, unit, role } of ready) {
    try {
      const outcome = await prisma.$transaction(async (tx) => {
        const locked = await lockMemberByEmail(tx, org.id, row.email);
        const existing = locked && (await tx.member.findUnique({ where: { id: locked.id }, select: { id: true, unit: { select: { path: true } } } }));
        // Checked again here: a member filed outside a scoped importer's unit is never taken over, in any mode.
        if (existing && !unitInScope(context.scope, existing.unit?.path ?? null)) throw new MembershipError("Outside your unit");
        if (!existing && org.memberLimit && (await tx.member.count({ where: { organisationId: org.id } })) >= org.memberLimit) throw new MembershipError("Member limit reached");
        // The preview's answer check, again on the locked row.
        const answers = Object.keys(row.fieldValues).length ? importAnswers(plans, (locked?.fieldValues ?? {}) as Record<string, unknown>, row.fieldValues) : null;
        if (answers && "error" in answers) throw new MembershipError(answers.error);
        // Columns that aren't imported leave the member's phone and state as they are.
        const member = await upsertMember(tx, org.id, {
          name: row.name, email: row.email, unitId: unit?.id ?? undefined,
          phone: mapping.includes("phone") ? row.phone : undefined,
          stateCode: !mapping.includes("state") ? undefined : row.stateCode && isIndianStateCode(row.stateCode) ? row.stateCode : null,
          fieldValues: answers?.values, fieldValuesMode: "replace", source: "IMPORT",
        });
        if (role) {
          const hasPrimary = await tx.memberRoleAssignment.count({ where: { memberId: member.id, isPrimary: true } });
          await tx.memberRoleAssignment.upsert({ where: { memberId_roleId: { memberId: member.id, roleId: role.id } }, create: { organisationId: org.id, memberId: member.id, roleId: role.id, isPrimary: hasPrimary === 0 }, update: {} });
          // A first primary role changes what the member's cards print.
          if (hasPrimary === 0 && (await tx.memberRoleAssignment.count({ where: { memberId: member.id, isPrimary: true } }))) await reissueCardsForRoleChange(tx, org.id, member.id, access.userId);
        }
        let opened = false;
        if (plan && mode !== "none") {
          const live = await tx.membershipTerm.count({ where: { memberId: member.id, planId: plan.id, status: { in: ["PENDING_APPROVAL", "PENDING_PAYMENT", "UPCOMING", "ACTIVE", "GRACE"] } } });
          if (!live) {
            // A plan limited to units admits only members whose unit (this row's, else their current one) it reaches.
            if (!planOffersUnit(plan, plan.units.map((entry) => entry.unit.path), unit?.path ?? existing?.unit?.path ?? null)) throw new MembershipError("Plan not offered in this unit");
            await openTerm(tx, { org, plan, memberId: member.id, byManager: true, needsVerification: mode === "verify", actorUserId: access.userId });
            opened = true;
          }
        }
        // A row without a unit keeps the member's own, and its leads verify them.
        return { created: !existing, opened, unitPath: unit?.path ?? existing?.unit?.path ?? null };
      });
      if (outcome.created) created += 1;
      else updated += 1;
      if (outcome.opened && mode === "verify") waiting.push(outcome.unitPath);
    } catch (error) {
      skipped.push({ row: rowNumber, reason: error instanceof MembershipError ? error.message : "Couldn't be saved" });
    }
  }
  skipped.sort((a, b) => a.row - b.row);
  // The import's closing transaction: its audit row and the one alert per lead go in together.
  await prisma.$transaction(async (tx) => {
    await recordAuditEvent({ action: "MEMBERS_IMPORTED", actorUserId: access.userId, organisationId: org.id, targetType: "Organisation", targetId: org.id, metadata: { created, updated, waiting: waiting.length, skipped: skipped.length, source: parsed.data.source.kind, membership: mode }, client: tx });
    await queueVerificationAlerts(tx, org.id, access.userId, waiting);
  });
  revalidatePath(`/dashboard/${org.slug}/members`);
  return { ok: true, data: { created, updated, waiting: waiting.length, skipped: skipped.slice(0, 100) } };
}
