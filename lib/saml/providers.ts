import "server-only";

import { prisma } from "@/lib/db";

export type SamlProviderConfig = {
  id: string;
  slug: string;
  name: string;
  entityId: string;
  ssoUrl: string;
  idpCertificate: string;
  spEntityId: string | null;
  wantAssertionsSigned: boolean;
};

const select = { id: true, slug: true, name: true, entityId: true, ssoUrl: true, idpCertificate: true, spEntityId: true, wantAssertionsSigned: true } as const;

export async function listEnabledSamlProviders(): Promise<SamlProviderConfig[]> {
  return prisma.samlProvider.findMany({ where: { enabled: true }, orderBy: { name: "asc" }, select });
}

/** One enabled provider by slug, or null (a disabled provider is treated as missing: "off means gone"). */
export async function findEnabledSamlProvider(slug: string): Promise<SamlProviderConfig | null> {
  return prisma.samlProvider.findFirst({ where: { slug, enabled: true }, select });
}

/** A provider by slug whatever its enabled state, for its public service-provider metadata (setup information only). */
export async function findSamlProviderBySlug(slug: string): Promise<SamlProviderConfig | null> {
  return prisma.samlProvider.findUnique({ where: { slug }, select });
}
