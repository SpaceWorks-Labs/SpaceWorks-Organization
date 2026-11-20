import type { MetadataRoute } from "next";
import { loadSitemapOrganisations } from "@/lib/views/app__sitemap";
import { DOC_SLUGS } from "@/lib/docs/pages";

// Reads listed organisations at request time, so the build never needs a database.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const now = new Date();
  const paths = ["/", "/features", "/docs", ...DOC_SLUGS.map((slug) => `/docs/${slug}`), "/organisations", "/about", "/privacy", "/terms"];
  const fixed = paths.map((path) => ({ url: `${baseUrl}${path}`, lastModified: now }));
  const organisations = await loadSitemapOrganisations();
  return [...fixed, ...organisations.map((org) => ({ url: `${baseUrl}/o/${org.slug}`, lastModified: org.updatedAt }))];
}
