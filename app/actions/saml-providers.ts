"use server";

import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/permissions";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { samlProviderKey } from "@/lib/saml/keys";
import { IDENTITY_CHANGE_REFUSED } from "@/lib/authMethods/providerKeys";
import { inspectIdpCertificate, normaliseIdpCertificate, testSamlConfig, type SamlTestResult } from "@/lib/saml/diagnose";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

const httpsUrl = (what: string) => z.string().trim().max(500).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}, `The ${what} must be an https address.`);

const schema = z.object({
  id: z.string().max(40).optional(),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/, "Use lowercase letters, digits and hyphens (up to 32)."),
  name: z.string().trim().min(1, "Enter a name.").max(60),
  entityId: z.string().trim().min(1, "Enter the identity provider's entity id.").max(500),
  ssoUrl: httpsUrl("sign-on address"),
  idpCertificate: z.string().trim().min(1, "Paste the identity provider's certificate.").max(20_000),
  spEntityId: z.string().trim().max(500).optional().transform((value) => value || null),
  wantAssertionsSigned: z.boolean(),
  enabled: z.boolean(),
});

async function guard() {
  const session = await requireSuperAdmin();
  return (await isActionRateLimited("action", session.user.id)) ? null : session;
}

/** Add or edit a SAML provider. Audited by field name; the certificate is public, but values are still not logged. */
export async function saveSamlProvider(input: unknown): Promise<ActionResult> {
  const session = await guard();
  if (!session) return { ok: false, error: "Too many requests. Try again shortly." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the provider settings." };
  const value = parsed.data;
  const cert = inspectIdpCertificate(value.idpCertificate);
  if (!cert.ok) return { ok: false, error: cert.error };
  const existing = value.id ? await prisma.samlProvider.findUnique({ where: { id: value.id } }) : null;
  if (value.id && !existing) return { ok: false, error: "That provider no longer exists." };
  const clash = await prisma.samlProvider.findUnique({ where: { slug: value.slug }, select: { id: true } });
  if (clash && clash.id !== existing?.id) return { ok: false, error: "Another provider already uses that short name." };

  const data = {
    slug: value.slug, name: value.name, entityId: value.entityId, ssoUrl: value.ssoUrl, idpCertificate: normaliseIdpCertificate(value.idpCertificate),
    spEntityId: value.spEntityId, wantAssertionsSigned: value.wantAssertionsSigned, enabled: value.enabled,
  };
  if (existing) {
    // Links are keyed by this row's id and hold the old IdP's subjects, so a different IdP identity is refused while any exist.
    const identityChanged = existing.entityId !== data.entityId || existing.ssoUrl !== data.ssoUrl;
    if (identityChanged && (await prisma.account.count({ where: { provider: samlProviderKey(existing.id) } })) > 0) return { ok: false, error: IDENTITY_CHANGE_REFUSED };
    const changed = (Object.keys(data) as (keyof typeof data)[]).filter((key) => existing[key] !== data[key]);
    await prisma.samlProvider.update({ where: { id: existing.id }, data });
    if (changed.length) await recordAuditEvent({ action: "SAML_PROVIDER_UPDATED", actorUserId: session.user.id, targetType: "SamlProvider", targetId: existing.id, metadata: { changed: changed.join(",") } });
  } else {
    const created = await prisma.samlProvider.create({ data, select: { id: true } });
    await recordAuditEvent({ action: "SAML_PROVIDER_CREATED", actorUserId: session.user.id, targetType: "SamlProvider", targetId: created.id, metadata: { slug: value.slug, enabled: value.enabled } });
  }
  revalidatePath("/login");
  revalidatePath("/super-admin/auth");
  return { ok: true };
}

export async function deleteSamlProvider(id: string): Promise<ActionResult> {
  const session = await guard();
  if (!session) return { ok: false, error: "Too many requests. Try again shortly." };
  const providerId = String(id).slice(0, 40);
  // The provider's account links go with it, in the same transaction (the people keep their other ways in).
  const { removed, links } = await prisma.$transaction(async (tx) => {
    const unlinked = await tx.account.deleteMany({ where: { provider: samlProviderKey(providerId) } });
    const gone = await tx.samlProvider.deleteMany({ where: { id: providerId } });
    return { removed: gone.count, links: unlinked.count };
  });
  if (removed) await recordAuditEvent({ action: "SAML_PROVIDER_REMOVED", actorUserId: session.user.id, targetType: "SamlProvider", targetId: providerId, metadata: { linksRemoved: links } });
  revalidatePath("/login");
  revalidatePath("/super-admin/auth");
  return { ok: true };
}

/** Check the certificate parses, and the metadata address if one is given. Nothing is saved. */
export async function testSamlProvider(input: unknown): Promise<ActionResult<SamlTestResult>> {
  const session = await guard();
  if (!session) return { ok: false, error: "Too many requests. Try again shortly." };
  const parsed = z.object({ ssoUrl: z.string().max(500), entityId: z.string().max(500), idpCertificate: z.string().max(20_000), metadataUrl: z.string().trim().max(500).optional().transform((value) => value || undefined) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the provider settings." };
  return { ok: true, data: await testSamlConfig(parsed.data) };
}
