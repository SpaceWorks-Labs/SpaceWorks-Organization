"use server";

import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { orgActionAccess, requireSuperAdmin } from "@/lib/permissions";
import { cleanRouting, MAX_ROUTE_LENGTH, MEMBER_CHANNELS, MEMBER_MESSAGE_KINDS, WHATSAPP_VARIABLES } from "@/lib/messages/kinds";
import { parseClock } from "@/lib/notify/quiet";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const orgSlug = z.string().trim().min(1).max(64);

const routingSchema = z.object({
  organisationSlug: orgSlug,
  routing: z.record(z.string().max(40), z.array(z.enum(MEMBER_CHANNELS)).max(MAX_ROUTE_LENGTH)),
  /** "22:00" and "08:00", both empty for no quiet hours. */
  quietStart: z.string().trim().max(5),
  quietEnd: z.string().trim().max(5),
});

/** Which channels each kind of message uses, in order (the first one the member can be reached on sends it, and no other), and quiet hours. */
export async function saveMessagingRouting(input: unknown): Promise<ActionResult> {
  const parsed = routingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the routing." };
  const ctx = await orgActionAccess(parsed.data.organisationSlug, "org.settings");
  if (!ctx.ok) return ctx;
  if (await isActionRateLimited("action", ctx.userId)) return { ok: false, error: "Too many requests. Try again shortly." };
  const start = parsed.data.quietStart ? parseClock(parsed.data.quietStart) : null;
  const end = parsed.data.quietEnd ? parseClock(parsed.data.quietEnd) : null;
  if ((start === null) !== (end === null) || (parsed.data.quietStart && start === null) || (parsed.data.quietEnd && end === null)) return { ok: false, error: "Set both quiet hours as times such as 22:00 and 08:00, or leave both empty." };
  if (start !== null && start === end) return { ok: false, error: "Quiet hours need different start and end times." };
  const organisationId = ctx.organisation.id;
  const routing = cleanRouting(parsed.data.routing);
  const data = { routing, quietStartMinute: start, quietEndMinute: end };
  await prisma.$transaction(async (tx) => {
    await tx.orgMessagingSettings.upsert({ where: { organisationId }, create: { organisationId, ...data }, update: data });
    await recordAuditEvent({ action: "ORG_MESSAGING_ROUTING_SAVED", actorUserId: ctx.userId, organisationId, targetType: "Organisation", targetId: organisationId, metadata: { kinds: Object.keys(routing).length, quiet: start !== null }, client: tx });
  });
  revalidatePath(`/dashboard/${ctx.organisation.slug}/settings/messaging`);
  return { ok: true };
}

const templateSchema = z.object({
  organisationSlug: orgSlug.optional(),
  kind: z.enum(MEMBER_MESSAGE_KINDS),
  language: z.string().trim().regex(/^[a-z]{2}(_[A-Z]{2})?$/, "Use a language code such as en or en_US"),
  name: z.string().trim().min(1, "Add the template name").max(200),
  variables: z.array(z.enum(WHATSAPP_VARIABLES)).max(10),
});

async function templateScope(organisationSlug: string | undefined) {
  if (!organisationSlug) {
    const session = await requireSuperAdmin();
    return { ok: true as const, organisationId: null, userId: session.user.id, slug: null };
  }
  const ctx = await orgActionAccess(organisationSlug, "org.settings");
  return ctx.ok ? { ok: true as const, organisationId: ctx.organisation.id, userId: ctx.userId, slug: ctx.organisation.slug } : ctx;
}

const refresh = (slug: string | null) => revalidatePath(slug ? `/dashboard/${slug}/settings/messaging` : "/super-admin/messaging");

/** The approved WhatsApp template a kind uses in one language, and the ordered placeholders that fill it. The platform's (no slug) is the super admin's. */
export async function saveWhatsAppTemplate(input: unknown): Promise<ActionResult> {
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the template." };
  const scope = await templateScope(parsed.data.organisationSlug);
  if (!scope.ok) return scope;
  const { kind, language, name, variables } = parsed.data;
  const existing = await prisma.whatsAppTemplate.findFirst({ where: { organisationId: scope.organisationId, kind, language }, select: { id: true } });
  if (existing) await prisma.whatsAppTemplate.update({ where: { id: existing.id }, data: { name, variables } });
  else await prisma.whatsAppTemplate.create({ data: { organisationId: scope.organisationId, kind, language, name, variables } });
  await recordAuditEvent({ action: "WHATSAPP_TEMPLATE_SAVED", actorUserId: scope.userId, organisationId: scope.organisationId, targetType: "WhatsAppTemplate", targetId: kind, metadata: { kind, language } });
  refresh(scope.slug);
  return { ok: true };
}

export async function deleteWhatsAppTemplate(input: unknown): Promise<ActionResult> {
  const parsed = templateSchema.pick({ organisationSlug: true, kind: true, language: true }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const scope = await templateScope(parsed.data.organisationSlug);
  if (!scope.ok) return scope;
  const { count } = await prisma.whatsAppTemplate.deleteMany({ where: { organisationId: scope.organisationId, kind: parsed.data.kind, language: parsed.data.language } });
  if (count) await recordAuditEvent({ action: "WHATSAPP_TEMPLATE_REMOVED", actorUserId: scope.userId, organisationId: scope.organisationId, targetType: "WhatsAppTemplate", targetId: parsed.data.kind, metadata: { kind: parsed.data.kind, language: parsed.data.language } });
  refresh(scope.slug);
  return { ok: true };
}
