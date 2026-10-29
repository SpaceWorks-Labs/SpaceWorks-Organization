import type { Metadata } from "next";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { OwnershipOfferPanel } from "@/components/team/OwnershipOfferPanel";
import { loadOwnershipOfferView } from "@/lib/views/app__dashboard__orgSlug__ownership__page";

export const metadata: Metadata = { title: "Ownership offer", description: "Accept the organisation's ownership." };

/** Where the offer email leads: the person named can accept here, whatever else their role allows. */
export default async function OwnershipOfferPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { organisation, offer } = await loadOwnershipOfferView({ params });
  return (
    <div className="flex flex-col gap-7 pb-4">
      <OrgPageHeader organisation={organisation} title="Ownership offer" description={`${offer.fromName} wants to hand ${organisation.name} over to you.`} />
      <OwnershipOfferPanel offer={offer} />
    </div>
  );
}
