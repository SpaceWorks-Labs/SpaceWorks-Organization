"use server";

import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { invalidateOrg } from "@/lib/cache";
import { orgActionAccess } from "@/lib/permissions";
import { changedFields } from "@/lib/telemetry/changes";
import { allowedTelemetryOrigins } from "@/lib/telemetry/env";
import { parseOrgTelemetry } from "@/lib/telemetry/organisation";
import { telemetrySchema } from "@/lib/telemetry/schema";
import type { WebTelemetryConfig } from "@/lib/telemetry/types";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const inputSchema = z.object({ organisationSlug: z.string().trim().min(1).max(64), config: z.unknown() });

/**
 * Save an organisation's own public telemetry ids (product rules section 8.2). Owner only: "org.delete" is the
 * Owner-only permission that guards the organisation itself, and a super admin with platform access acts as the
 * Owner. The schema is the platform's: strict, public ids only (so Mixpanel and secret fields are refused), with
 * endpoints limited to the origins the operator listed in WEB_TELEMETRY_ALLOWED_ORIGINS.
 */
export async function saveOrgWebTelemetry(input: unknown): Promise<ActionResult> {
  const request = inputSchema.safeParse(input);
  if (!request.success) return { ok: false, error: "Check the web analytics settings." };
  const ctx = await orgActionAccess(request.data.organisationSlug, "org.delete");
  if (!ctx.ok) return ctx;
  if (await isActionRateLimited("action", ctx.userId)) return { ok: false, error: "Too many requests. Try again shortly." };
  const allowed = allowedTelemetryOrigins();
  const parsed = telemetrySchema(allowed).safeParse(request.data.config);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid web analytics settings." };
  const config = parsed.data as WebTelemetryConfig;
  const existing = await prisma.organisation.findUnique({ where: { id: ctx.organisation.id }, select: { webTelemetry: true } });
  const changed = changedFields(parseOrgTelemetry(existing?.webTelemetry, allowed).config, config);
  if (changed.length === 0) return { ok: true };

  await prisma.organisation.update({ where: { id: ctx.organisation.id }, data: { webTelemetry: config } });
  await recordAuditEvent({
    action: "ORG_WEB_TELEMETRY_UPDATED",
    actorUserId: ctx.userId,
    organisationId: ctx.organisation.id,
    targetType: "Organisation",
    targetId: ctx.organisation.id,
    metadata: { changed: changed.join(",") },
  });
  await invalidateOrg(ctx.organisation.id, "public-page");
  revalidatePath(`/dashboard/${ctx.organisation.slug}/settings/analytics`);
  revalidatePath(`/o/${ctx.organisation.slug}`, "layout");
  return { ok: true };
}
