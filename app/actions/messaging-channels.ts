"use server";

import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { INSTANCE_SETTINGS_ID } from "@/lib/instanceSettings";
import { orgActionAccess, requireSuperAdmin } from "@/lib/permissions";
import { CONFIGURABLE_CHANNELS } from "@/lib/messages/kinds";
import { removeChannel, saveChannel, testChannel } from "@/lib/notify/channelAdmin";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

const channelInput = z.object({
  channel: z.enum(CONFIGURABLE_CHANNELS),
  provider: z.string().trim().min(1).max(20),
  enabled: z.boolean(),
  /** Plain fields replace; a secret left blank keeps the saved one. */
  fields: z.record(z.string().max(100), z.string().max(700)),
});
const orgSlug = z.string().trim().min(1).max(64);

const settle = (result: Awaited<ReturnType<typeof saveChannel>>): ActionResult => (result.ok ? { ok: true } : result);

/** An organisation's own channel connection. The Owner's alone ("org.delete"): it holds the organisation's bot secrets. */
export async function saveOrgChannel(input: unknown): Promise<ActionResult> {
  const parsed = channelInput.extend({ organisationSlug: orgSlug }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the connection details." };
  const ctx = await orgActionAccess(parsed.data.organisationSlug, "org.delete");
  if (!ctx.ok) return ctx;
  if (await isActionRateLimited("action", ctx.userId)) return { ok: false, error: "Too many requests. Try again shortly." };
  const result = settle(await saveChannel({ scopeOrgId: ctx.organisation.id, channel: parsed.data.channel, provider: parsed.data.provider, draft: parsed.data.fields, enabled: parsed.data.enabled, actorUserId: ctx.userId }));
  revalidatePath(`/dashboard/${ctx.organisation.slug}/settings/messaging`);
  return result;
}

export async function testOrgChannel(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ organisationSlug: orgSlug, channel: z.enum(CONFIGURABLE_CHANNELS), phone: z.string().trim().max(40).optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await orgActionAccess(parsed.data.organisationSlug, "org.delete");
  if (!ctx.ok) return ctx;
  if (await isActionRateLimited("testEmail", ctx.userId)) return { ok: false, error: "You've run several tests. Try again in an hour." };
  const result = await testChannel({ scopeOrgId: ctx.organisation.id, channel: parsed.data.channel, phone: parsed.data.phone, actorUserId: ctx.userId });
  revalidatePath(`/dashboard/${ctx.organisation.slug}/settings/messaging`);
  return result;
}

export async function removeOrgChannel(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ organisationSlug: orgSlug, channel: z.enum(CONFIGURABLE_CHANNELS) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await orgActionAccess(parsed.data.organisationSlug, "org.delete");
  if (!ctx.ok) return ctx;
  const result = await removeChannel(ctx.organisation.id, parsed.data.channel, ctx.userId);
  revalidatePath(`/dashboard/${ctx.organisation.slug}/settings/messaging`);
  return result;
}

/** The platform's own channel connection (super admin). Platform SMS is set up under Sign-in and security, not here. */
export async function saveInstanceChannel(input: unknown): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  const parsed = channelInput.safeParse(input);
  if (!parsed.success || parsed.data.channel === "SMS") return { ok: false, error: "Check the connection details." };
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: "Too many requests. Try again shortly." };
  const result = settle(await saveChannel({ scopeOrgId: null, channel: parsed.data.channel, provider: parsed.data.provider, draft: parsed.data.fields, enabled: parsed.data.enabled, actorUserId: session.user.id }));
  revalidatePath("/super-admin/messaging");
  return result;
}

export async function testInstanceChannel(input: unknown): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  const parsed = z.object({ channel: z.enum(CONFIGURABLE_CHANNELS) }).safeParse(input);
  if (!parsed.success || parsed.data.channel === "SMS") return { ok: false, error: "Invalid request." };
  if (await isActionRateLimited("testEmail", session.user.id)) return { ok: false, error: "You've run several tests. Try again in an hour." };
  const result = await testChannel({ scopeOrgId: null, channel: parsed.data.channel, actorUserId: session.user.id });
  revalidatePath("/super-admin/messaging");
  return result;
}

export async function removeInstanceChannel(input: unknown): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  const parsed = z.object({ channel: z.enum(CONFIGURABLE_CHANNELS) }).safeParse(input);
  if (!parsed.success || parsed.data.channel === "SMS") return { ok: false, error: "Invalid request." };
  const result = await removeChannel(null, parsed.data.channel, session.user.id);
  revalidatePath("/super-admin/messaging");
  return result;
}

/** Whether organisations without their own connection may send through the platform's. */
export async function saveMessagingPolicy(input: unknown): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  const parsed = z.object({ allowOrganisations: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  await prisma.instanceSetting.upsert({ where: { id: INSTANCE_SETTINGS_ID }, create: { id: INSTANCE_SETTINGS_ID, messagingOrgsMayUsePlatform: parsed.data.allowOrganisations }, update: { messagingOrgsMayUsePlatform: parsed.data.allowOrganisations } });
  await recordAuditEvent({ action: "MESSAGING_POLICY_UPDATED", actorUserId: session.user.id, targetType: "InstanceSetting", targetId: INSTANCE_SETTINGS_ID, metadata: { allowOrganisations: parsed.data.allowOrganisations } });
  revalidatePath("/super-admin/messaging");
  return { ok: true };
}
