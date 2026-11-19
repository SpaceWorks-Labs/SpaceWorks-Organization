"use server";

import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/permissions";
import { recordAuditEvent } from "@/lib/audit";
import { encryptInstanceConfigSecret } from "@/lib/instanceConfigSecrets";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { oidcProviderId } from "@/lib/oidc/providers";
import { IDENTITY_CHANGE_REFUSED } from "@/lib/authMethods/providerKeys";
import { testOidcConnection, type OidcTestResult } from "@/lib/oidc/discovery";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/, "Use lowercase letters, digits and hyphens (up to 32).");
const issuer = z.string().trim().max(300).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}, "The issuer must be an https address without a query or fragment.");
const scopes = z.string().trim().max(200).regex(/^[A-Za-z0-9:._/ -]+$/, "Scopes are words separated by spaces.").refine((value) => value.split(/\s+/).includes("openid"), "Scopes must include openid.");

const schema = z.object({
  id: z.string().max(40).optional(),
  slug,
  name: z.string().trim().min(1, "Enter a name.").max(60),
  issuer,
  clientId: z.string().trim().min(1, "Enter the client id.").max(300),
  /** Write-only: blank keeps the stored secret. */
  clientSecret: z.string().max(2048).optional().transform((value) => value?.trim() || null),
  scopes: scopes.default("openid email profile"),
  enabled: z.boolean(),
});

async function guard() {
  const session = await requireSuperAdmin();
  return (await isActionRateLimited("action", session.user.id)) ? null : session;
}

/**
 * Add or edit an OpenID Connect provider. The client secret is write-only; the audit row names the changed fields
 * only, never a value.
 */
export async function saveOidcProvider(input: unknown): Promise<ActionResult> {
  const session = await guard();
  if (!session) return { ok: false, error: "Too many requests. Try again shortly." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the provider settings." };
  const value = parsed.data;
  const existing = value.id ? await prisma.oidcProvider.findUnique({ where: { id: value.id } }) : null;
  if (value.id && !existing) return { ok: false, error: "That provider no longer exists." };
  if (!existing && !value.clientSecret) return { ok: false, error: "Enter the client secret." };
  const clash = await prisma.oidcProvider.findUnique({ where: { slug: value.slug }, select: { id: true } });
  if (clash && clash.id !== existing?.id) return { ok: false, error: "Another provider already uses that short name." };

  const data = { slug: value.slug, name: value.name, issuer: value.issuer, clientId: value.clientId, scopes: value.scopes, enabled: value.enabled };
  if (existing) {
    // Links are keyed by this row's id, so a different issuer would let its users reach accounts linked under the old one.
    if (existing.issuer !== data.issuer && (await prisma.account.count({ where: { provider: oidcProviderId(existing.id) } })) > 0) return { ok: false, error: IDENTITY_CHANGE_REFUSED };
    const changed: string[] = (Object.keys(data) as (keyof typeof data)[]).filter((key) => existing[key] !== data[key]);
    if (value.clientSecret) changed.push("clientSecret");
    await prisma.oidcProvider.update({ where: { id: existing.id }, data: { ...data, ...(value.clientSecret ? { clientSecretEncrypted: encryptInstanceConfigSecret(value.clientSecret) } : {}) } });
    if (changed.length) await recordAuditEvent({ action: "OIDC_PROVIDER_UPDATED", actorUserId: session.user.id, targetType: "OidcProvider", targetId: existing.id, metadata: { changed: changed.join(",") } });
  } else {
    const created = await prisma.oidcProvider.create({ data: { ...data, clientSecretEncrypted: encryptInstanceConfigSecret(value.clientSecret!) }, select: { id: true } });
    await recordAuditEvent({ action: "OIDC_PROVIDER_CREATED", actorUserId: session.user.id, targetType: "OidcProvider", targetId: created.id, metadata: { slug: value.slug, enabled: value.enabled } });
  }
  revalidatePath("/login");
  revalidatePath("/super-admin/auth");
  return { ok: true };
}

/** Remove a provider and, in the same transaction, every account link made through it (the people keep their other ways in). */
export async function deleteOidcProvider(id: string): Promise<ActionResult> {
  const session = await guard();
  if (!session) return { ok: false, error: "Too many requests. Try again shortly." };
  const providerId = String(id).slice(0, 40);
  const { removed, links } = await prisma.$transaction(async (tx) => {
    const unlinked = await tx.account.deleteMany({ where: { provider: oidcProviderId(providerId) } });
    const gone = await tx.oidcProvider.deleteMany({ where: { id: providerId } });
    return { removed: gone.count, links: unlinked.count };
  });
  if (removed) await recordAuditEvent({ action: "OIDC_PROVIDER_REMOVED", actorUserId: session.user.id, targetType: "OidcProvider", targetId: providerId, metadata: { linksRemoved: links } });
  revalidatePath("/login");
  revalidatePath("/super-admin/auth");
  return { ok: true };
}

/** Fetch the issuer's discovery document and check it (no secret is sent, nothing is saved). */
export async function testOidcProvider(input: unknown): Promise<ActionResult<OidcTestResult>> {
  const session = await guard();
  if (!session) return { ok: false, error: "Too many requests. Try again shortly." };
  const parsed = issuer.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter the issuer." };
  return { ok: true, data: await testOidcConnection(parsed.data) };
}
