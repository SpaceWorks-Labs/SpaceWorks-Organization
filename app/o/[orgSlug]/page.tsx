import { Globe, Mail, MapPin, Phone } from "lucide-react";
import { loadPublicOrgPage } from "@/lib/views/app__o__orgSlug__page";
import { indianStateName } from "@/lib/indianStates";
import { PageSections } from "@/components/public/PageSections";
import { PlanCards } from "@/components/public/PlanCards";
import { RevealRoot } from "@/components/motion/RevealRoot";
import { Chip, OrgLogo } from "@/components/ui/display";

export default async function PublicOrganisationPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { org, plans, takingMembers, page, units, counts, sampleCard } = await loadPublicOrgPage({ params });

  // The tenant logo never animates: its block stays still and only `data-route-enter` parts move (template.tsx).
  // A published custom page (Settings → Public page) replaces the plain one. Sections lay out by their container
  // (@container), so the editor's phone and desktop previews reflow exactly as the page does.
  if (page) {
    return (
      <RevealRoot className="@container mx-auto w-full max-w-[1120px] px-4 py-10 sm:px-6 lg:py-16">
        <PageSections document={page} org={org} plans={plans} units={units} takingMembers={takingMembers} counts={counts} sampleCard={sampleCard} preview={false} />
      </RevealRoot>
    );
  }

  const place = [org.city, indianStateName(org.stateCode)].filter(Boolean).join(", ");
  return (
    <div className="@container mx-auto flex w-full max-w-[1120px] flex-col gap-12 px-4 py-10 sm:px-6 lg:py-16">
      <section aria-labelledby="org-name" className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex max-w-[720px] flex-col gap-5">
          <div data-tenant-logo className="w-fit"><OrgLogo name={org.name} src={org.logoUrl} size="xl" /></div>
          <div className="flex flex-col gap-2">
            {org.kind ? <Chip tone="outline" className="w-fit">{org.kind}</Chip> : null}
            <h1 id="org-name" className="text-display-m text-balance text-ink">{org.name}</h1>
          </div>
          {org.description ? <p className="whitespace-pre-wrap text-body-l text-ink-secondary">{org.description}</p> : null}
        </div>
        <dl className="flex shrink-0 flex-col gap-3 rounded-xl border border-line bg-panel p-5 text-body-ui lg:w-[300px]">
          {place ? <div className="flex items-center gap-2.5"><dt><MapPin aria-label="Location" className="size-4 text-ink-muted" /></dt><dd>{place}</dd></div> : null}
          {org.contactEmail ? <div className="flex items-center gap-2.5"><dt><Mail aria-label="Email" className="size-4 text-ink-muted" /></dt><dd className="min-w-0 truncate"><a className="underline-offset-4 hover:underline" href={`mailto:${org.contactEmail}`}>{org.contactEmail}</a></dd></div> : null}
          {org.contactPhone ? <div className="flex items-center gap-2.5"><dt><Phone aria-label="Phone" className="size-4 text-ink-muted" /></dt><dd><a className="underline-offset-4 hover:underline" href={`tel:${org.contactPhone.replace(/\s/g, "")}`}>{org.contactPhone}</a></dd></div> : null}
          {org.website ? <div className="flex items-center gap-2.5"><dt><Globe aria-label="Website" className="size-4 text-ink-muted" /></dt><dd className="min-w-0 truncate"><a className="underline-offset-4 hover:underline" href={org.website} rel="noopener noreferrer" target="_blank">{org.website.replace(/^https?:\/\//, "")}</a></dd></div> : null}
        </dl>
      </section>

      <section aria-labelledby="plans" data-route-enter className="flex flex-col gap-6">
        <h2 id="plans" className="text-h1 text-ink">Membership</h2>
        <PlanCards org={org} plans={plans} takingMembers={takingMembers} />
      </section>
    </div>
  );
}
