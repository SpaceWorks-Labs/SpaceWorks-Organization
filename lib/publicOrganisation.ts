import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

/**
 * The organisation behind a public page. Active and suspended organisations have one (a suspended one
 * says it isn't taking members); applications, refusals and archived organisations don't.
 */
export const loadPublicOrganisation = cache(async (slug: string) => {
  const org = await prisma.organisation.findUnique({
    where: { slug },
    select: {
      id: true, slug: true, name: true, kind: true, description: true, logoUrl: true, accentColor: true, status: true, visibility: true,
      city: true, stateCode: true, website: true, contactEmail: true, contactPhone: true, locale: true, timezone: true, financialYearStartMonth: true, unitLevels: true, delightEnabled: true,
      page: { select: { accentColor: true, tagline: true, publishedAt: true } },
    },
  });
  if (!org || (org.status !== "ACTIVE" && org.status !== "SUSPENDED")) notFound();
  return org;
});
