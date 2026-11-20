"use server";

import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { INSTANCE_SETTINGS_ID } from "@/lib/instanceSettings";
import { requireSuperAdmin } from "@/lib/permissions";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { allowedTelemetryOrigins } from "@/lib/telemetry/env";
import { parseStoredTelemetry, telemetrySchema } from "@/lib/telemetry/schema";
import { changedFields } from "@/lib/telemetry/changes";
import { emptyTelemetryConfig, type WebTelemetryConfig } from "@/lib/telemetry/types";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

/**
 * Save the platform's public telemetry ids (product rules §8.2). Public identifiers only: the schema is strict,
 * so a secret field is refused, and endpoints must be origins the operator listed in WEB_TELEMETRY_ALLOWED_ORIGINS.
 */
export async function saveWebTelemetry(input: unknown): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: "Too many requests. Try again shortly." };
  const allowed = allowedTelemetryOrigins();
  const parsed = telemetrySchema(allowed).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid web analytics settings." };
  const config = parsed.data as WebTelemetryConfig;
  const existing = await prisma.instanceSetting.findUnique({ where: { id: INSTANCE_SETTINGS_ID }, select: { webTelemetry: true } });
  const before = (existing?.webTelemetry ? parseStoredTelemetry(existing.webTelemetry, allowed) : null) ?? emptyTelemetryConfig();
  const changed = changedFields(before, config);
  if (changed.length === 0) return { ok: true };

  await prisma.instanceSetting.upsert({
    where: { id: INSTANCE_SETTINGS_ID },
    create: { id: INSTANCE_SETTINGS_ID, webTelemetry: config },
    update: { webTelemetry: config },
  });
  await recordAuditEvent({
    action: "WEB_TELEMETRY_UPDATED",
    actorUserId: session.user.id,
    targetType: "InstanceSetting",
    targetId: INSTANCE_SETTINGS_ID,
    metadata: { changed: changed.join(",") },
  });
  revalidatePath("/super-admin/settings");
  revalidatePath("/privacy");
  revalidatePath("/", "layout");
  return { ok: true };
}
