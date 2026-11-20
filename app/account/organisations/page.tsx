import { loadAccountOrganisationsView } from "@/lib/views/app__account__organisations__page";
import type { Metadata } from "next";
import { AccountOrganisations } from "@/components/account/organisations/AccountOrganisations";
import { SectionHeading } from "@/components/ui/display";

export const metadata: Metadata = { title: "Your organisations" };

export default async function AccountOrganisationsPage() {
  const { data } = await loadAccountOrganisationsView();
  return (
    <div className="flex flex-col gap-6">
      <SectionHeading as="h1" title="Organisations" />
      <AccountOrganisations data={data} />
    </div>
  );
}
