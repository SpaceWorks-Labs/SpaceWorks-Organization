"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { unitCodeSchema, unitLevelsSchema, unitSchema } from "@/lib/membership/validators";
import { lockOrganisationStructure, refreshStructure, structureAccess } from "@/lib/structure/access";
import { firstFreeUnitCode, unitCodeBase } from "@/lib/structure/units";
import { UNIT_INSTRUCTIONS_MAX } from "@/lib/payments/unitInstructions";
import type { ActionResult } from "./org";
import { flattenZodErrors } from "./utils";

const MAX_UNITS = 2000;

/** Thrown inside a structure transaction to roll it back with a message for the person. */
class StructureError extends Error {}

function uniqueTarget(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return null;
  const target = (error.meta as { target?: string[] | string } | undefined)?.target;
  return Array.isArray(target) ? target.join(",") : String(target ?? "");
}

function failed(error: unknown): Extract<ActionResult, { ok: false }> | null {
  if (error instanceof StructureError) return { ok: false, error: error.message };
  const target = uniqueTarget(error);
  if (target === null) return null;
  if (target.includes("code")) return { ok: false, error: "Another unit already uses that code.", fieldErrors: { code: ["Already used"] } };
  return { ok: false, error: "Another unit already uses that short name.", fieldErrors: { slug: ["Already used"] } };
}

/** Name the levels the organisation uses, top first (for example Area, Unit). */
export async function setUnitLevels(input: unknown): Promise<ActionResult> {
  const parsed = unitLevelsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Level names are 2 to 40 characters, at most four levels.", fieldErrors: flattenZodErrors(parsed.error) };
  const access = await structureAccess(parsed.data.organisationSlug);
  if (!access.ok) return access;
  const organisationId = access.organisation.id;
  try {
    await prisma.$transaction(async (tx) => {
      await lockOrganisationStructure(tx, organisationId);
      const deepest = await tx.orgUnit.aggregate({ where: { organisationId, archivedAt: null }, _max: { level: true } });
      if (deepest._max.level !== null && deepest._max.level >= parsed.data.levels.length) {
        throw new StructureError("Some units sit deeper than the levels you kept. Archive them first.");
      }
      await tx.organisation.update({ where: { id: organisationId }, data: { unitLevels: parsed.data.levels } });
      await recordAuditEvent({ action: "UNIT_LEVELS_CHANGED", actorUserId: access.userId, organisationId, targetType: "Organisation", targetId: organisationId, client: tx });
    });
  } catch (error) {
    const result = failed(error);
    if (result) return result;
    throw error;
  }
  await refreshStructure(access.organisation);
  return { ok: true };
}

/** Add a unit under a parent (or at the top). Its depth must have a level name. */
export async function createUnit(input: unknown): Promise<ActionResult<{ unitId: string; code: string }>> {
  const parsed = unitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error) };
  const access = await structureAccess(parsed.data.organisationSlug);
  if (!access.ok) return access;
  const organisationId = access.organisation.id;
  try {
    const unit = await prisma.$transaction(async (tx) => {
      await lockOrganisationStructure(tx, organisationId);
      const org = await tx.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { unitLevels: true } });
      const parent = parsed.data.parentId
        ? await tx.orgUnit.findFirst({ where: { organisationId, id: parsed.data.parentId, archivedAt: null }, select: { id: true, level: true, path: true } })
        : null;
      if (parsed.data.parentId && !parent) throw new StructureError("The parent unit no longer exists.");
      const level = parent ? parent.level + 1 : 0;
      if (level >= Math.max(org.unitLevels.length, 1)) throw new StructureError("Name a deeper level first under Levels.");
      if ((await tx.orgUnit.count({ where: { organisationId } })) >= MAX_UNITS) throw new StructureError("This organisation has reached the unit limit.");
      let code = parsed.data.code;
      if (!code) {
        const base = unitCodeBase(parsed.data.name);
        const taken = await tx.orgUnit.findMany({ where: { organisationId, code: { startsWith: base.slice(0, 1) } }, select: { code: true } });
        code = firstFreeUnitCode(base, new Set(taken.map((row) => row.code)));
      }
      const created = await tx.orgUnit.create({
        data: { organisationId, parentId: parent?.id ?? null, name: parsed.data.name, slug: parsed.data.slug, code, level, path: "pending" },
      });
      await tx.orgUnit.update({ where: { id: created.id }, data: { path: parent ? `${parent.path}/${created.id}` : created.id } });
      await recordAuditEvent({ action: "UNIT_CREATED", actorUserId: access.userId, organisationId, targetType: "OrgUnit", targetId: created.id, client: tx });
      return created;
    });
    await refreshStructure(access.organisation);
    return { ok: true, data: { unitId: unit.id, code: unit.code } };
  } catch (error) {
    const result = failed(error);
    if (result) return result;
    throw error;
  }
}

const updateSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  unitId: z.string().trim().min(1).max(64),
  name: z.string().trim().min(2, "Names are 2 to 80 characters.").max(80),
  code: unitCodeSchema,
});

/** Rename a unit or change its code. Live card numbers keep the code they were issued with. */
export async function updateUnit(input: unknown): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error) };
  const access = await structureAccess(parsed.data.organisationSlug);
  if (!access.ok) return access;
  try {
    const updated = await prisma.orgUnit.updateMany({ where: { id: parsed.data.unitId, organisationId: access.organisation.id }, data: { name: parsed.data.name, code: parsed.data.code } });
    if (updated.count !== 1) return { ok: false, error: "Unit not found." };
  } catch (error) {
    const result = failed(error);
    if (result) return result;
    throw error;
  }
  await recordAuditEvent({ action: "UNIT_UPDATED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "OrgUnit", targetId: parsed.data.unitId });
  await refreshStructure(access.organisation);
  return { ok: true };
}

const archiveSchema = z.object({ organisationSlug: z.string().trim().min(1), unitId: z.string().trim().min(1).max(64), archived: z.boolean() });

/** Archive a unit and everything under it. Members keep their unit for history; new members can't pick it. */
export async function setUnitArchived(input: unknown): Promise<ActionResult> {
  const parsed = archiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const access = await structureAccess(parsed.data.organisationSlug);
  if (!access.ok) return access;
  const organisationId = access.organisation.id;
  try {
    await prisma.$transaction(async (tx) => {
      await lockOrganisationStructure(tx, organisationId);
      const unit = await tx.orgUnit.findFirst({ where: { id: parsed.data.unitId, organisationId }, select: { path: true, parent: { select: { archivedAt: true } } } });
      if (!unit) throw new StructureError("Unit not found.");
      const subtree = { organisationId, OR: [{ path: unit.path }, { path: { startsWith: `${unit.path}/` } }] };
      if (!parsed.data.archived) {
        if (unit.parent?.archivedAt) throw new StructureError("Restore the unit above it first.");
        // Levels may have been removed while the subtree was archived.
        const { unitLevels } = await tx.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { unitLevels: true } });
        if (await tx.orgUnit.count({ where: { ...subtree, level: { gte: unitLevels.length } } })) throw new StructureError("Some units under it sit deeper than your levels. Add the level back first.");
      }
      await tx.orgUnit.updateMany({
        where: subtree,
        data: { archivedAt: parsed.data.archived ? new Date() : null },
      });
      await recordAuditEvent({ action: parsed.data.archived ? "UNIT_ARCHIVED" : "UNIT_RESTORED", actorUserId: access.userId, organisationId, targetType: "OrgUnit", targetId: parsed.data.unitId, client: tx });
    });
  } catch (error) {
    const result = failed(error);
    if (result) return result;
    throw error;
  }
  await refreshStructure(access.organisation);
  return { ok: true };
}

const moveSchema = z.object({ organisationSlug: z.string().trim().min(1), unitId: z.string().trim().min(1).max(64), parentId: z.string().trim().min(1).max(64) });

/**
 * Move a unit, with everything under it, to another parent on the same level as its current one. Only paths change:
 * levels stay, members keep their unit, and reports follow because they expand subtrees when they read.
 */
export async function moveUnit(input: unknown): Promise<ActionResult> {
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const access = await structureAccess(parsed.data.organisationSlug);
  if (!access.ok) return access;
  const organisationId = access.organisation.id;
  try {
    await prisma.$transaction(async (tx) => {
      await lockOrganisationStructure(tx, organisationId);
      const unit = await tx.orgUnit.findFirst({ where: { id: parsed.data.unitId, organisationId }, select: { id: true, level: true, path: true, parentId: true, archivedAt: true } });
      if (!unit) throw new StructureError("Unit not found.");
      if (unit.archivedAt) throw new StructureError("Restore the unit before moving it.");
      if (unit.level === 0) throw new StructureError("Top-level units have no unit above them to move between.");
      if (unit.parentId === parsed.data.parentId) return;
      const parent = await tx.orgUnit.findFirst({ where: { id: parsed.data.parentId, organisationId }, select: { level: true, path: true, archivedAt: true } });
      if (!parent || parent.archivedAt) throw new StructureError("Choose a unit that isn't archived.");
      // Same level as the current parent, so the new parent can never sit inside the moved subtree.
      if (parent.level !== unit.level - 1) throw new StructureError("Move units only between parents on the same level.");
      const from = unit.path;
      const to = `${parent.path}/${unit.id}`;
      await tx.orgUnit.update({ where: { id: unit.id }, data: { parentId: parsed.data.parentId, path: to } });
      await tx.$executeRaw`
        UPDATE "OrgUnit" SET "path" = ${to} || substr("path", ${from.length + 1}::int)
        WHERE "organisationId" = ${organisationId} AND starts_with("path", ${`${from}/`})`;
      await recordAuditEvent({ action: "UNIT_MOVED", actorUserId: access.userId, organisationId, targetType: "OrgUnit", targetId: unit.id, metadata: { fromParentId: unit.parentId, toParentId: parsed.data.parentId }, client: tx });
    });
  } catch (error) {
    const result = failed(error);
    if (result) return result;
    throw error;
  }
  await refreshStructure(access.organisation);
  return { ok: true };
}

const instructionsSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  unitId: z.string().trim().min(1).max(64),
  paymentInstructions: z.string().trim().max(UNIT_INSTRUCTIONS_MAX, `At most ${UNIT_INSTRUCTIONS_MAX} characters.`),
});

/** How members of a unit pay offline (whom to pay, when, the UPI ID). Empty: the nearest unit above's, then the organisation's. */
export async function setUnitPaymentInstructions(input: unknown): Promise<ActionResult> {
  const parsed = instructionsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error) };
  const access = await structureAccess(parsed.data.organisationSlug);
  if (!access.ok) return access;
  const updated = await prisma.orgUnit.updateMany({ where: { id: parsed.data.unitId, organisationId: access.organisation.id }, data: { paymentInstructions: parsed.data.paymentInstructions } });
  if (updated.count !== 1) return { ok: false, error: "Unit not found." };
  await recordAuditEvent({ action: "UNIT_PAYMENT_INSTRUCTIONS_CHANGED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "OrgUnit", targetId: parsed.data.unitId });
  await refreshStructure(access.organisation);
  return { ok: true };
}
