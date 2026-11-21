"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { lockOrganisationStructure, refreshStructure, structureAccess } from "@/lib/structure/access";
import { checkUnitContact, type UnitContactValues } from "@/lib/units/contactInput";
import type { ActionResult } from "./org";

const schema = z.object({
  organisationSlug: z.string().trim().min(1),
  unitId: z.string().trim().min(1).max(64),
  contactEmail: z.string().max(300),
  contactPhone: z.string().max(100),
  website: z.string().max(500),
});

const FIELDS = ["contactEmail", "contactPhone", "website"] as const;

/**
 * An area's own contact details, printed on its members' card backs and shown on its area page. A detail left
 * empty is cleared, and members then see the one from the unit above, else the organisation's. Needs the same
 * permission as editing units (`structure.manage`, organisation-wide). The audit row names the fields that changed,
 * never their values.
 */
export async function setUnitContact(input: unknown): Promise<ActionResult<UnitContactValues>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const checked = checkUnitContact(parsed.data);
  if (!checked.ok) return { ok: false, error: "Check the highlighted fields.", fieldErrors: Object.fromEntries(Object.entries(checked.errors).map(([key, message]) => [key, [message]])) };
  const access = await structureAccess(parsed.data.organisationSlug);
  if (!access.ok) return access;
  const organisationId = access.organisation.id;
  const changed = await prisma.$transaction(async (tx) => {
    await lockOrganisationStructure(tx, organisationId);
    const unit = await tx.orgUnit.findFirst({ where: { id: parsed.data.unitId, organisationId }, select: { contactEmail: true, contactPhone: true, website: true } });
    if (!unit) return null;
    const fields = FIELDS.filter((field) => (unit[field] ?? null) !== checked.values[field]);
    await tx.orgUnit.update({ where: { id: parsed.data.unitId }, data: checked.values });
    if (fields.length > 0) await recordAuditEvent({ action: "UNIT_CONTACT_CHANGED", actorUserId: access.userId, organisationId, targetType: "OrgUnit", targetId: parsed.data.unitId, metadata: { fields: fields.join(",") }, client: tx });
    return fields;
  });
  if (!changed) return { ok: false, error: "Unit not found." };
  await refreshStructure(access.organisation);
  return { ok: true, data: checked.values };
}
