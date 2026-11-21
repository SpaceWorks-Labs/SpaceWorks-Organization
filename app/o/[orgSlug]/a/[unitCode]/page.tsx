import type { Metadata } from "next";
import { loadPublicAreaPage } from "@/lib/views/app__o__orgSlug__a__unitCode__page";
import { AreaBreadcrumb, OtherAreas } from "@/components/public/AreaNav";
import { PageSections } from "@/components/public/PageSections";
import { RevealRoot } from "@/components/motion/RevealRoot";

type Props = { params: Promise<{ orgSlug: string; unitCode: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org, area } = await loadPublicAreaPage({ params });
  return { title: area.name, description: `${org.name}, ${area.name}: membership plans and contact details.` };
}

/**
 * An area's page: the organisation's same published page for one area (the loader, lib/views/app__o__orgSlug__a__unitCode__page.ts,
 * scopes plans, numbers and contact to it, and uses a plain plans, areas and contact page when nothing is published).
 * The area's name folds into the hero's one h1; a breadcrumb leads back up and the foot lists the other areas.
 */
export default async function PublicAreaPage({ params }: Props) {
  const { org, plans, takingMembers, page, units, counts, sampleCard, liveStats, areas, area } = await loadPublicAreaPage({ params });
  return (
    <RevealRoot className="@container mx-auto flex w-full max-w-[1120px] flex-col gap-10 px-4 py-8 sm:px-6 lg:py-12">
      <AreaBreadcrumb orgName={org.name} orgSlug={org.slug} area={area} />
      {page ? (
        <PageSections document={page} org={org} plans={plans} units={units} takingMembers={takingMembers} counts={counts} sampleCard={sampleCard} liveStats={liveStats} areas={areas} area={area} preview={false} />
      ) : null}
      <OtherAreas orgName={org.name} orgSlug={org.slug} area={area} areas={areas} />
    </RevealRoot>
  );
}
