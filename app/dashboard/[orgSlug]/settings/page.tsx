import { loadOrgSettingsView } from "@/lib/views/app__dashboard__orgSlug__settings__page";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { EditOrgForm } from "@/components/org/EditOrgForm";
import { CopyOrganisationUrl } from "@/components/org/CopyOrganisationUrl";
import { DeleteOrganisationButton } from "@/components/dashboard/DeleteOrganisationButton";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { MemberPhotoUploadSwitch, MemberPortalSwitch } from "@/components/settings/MemberPortalSwitch";
import { cn } from "@/lib/cn";

import type { Metadata } from "next";

type Props = { params: Promise<{ orgSlug: string; }>; };

export const metadata: Metadata = {
  title: "Settings",
  description: "Edit organisation details.",
};

const sectionCard = "rounded-xl border border-line bg-panel p-5 sm:p-6";

export default async function OrgSettingsPage({ params }: Props) {
  const { org, canDelete, canEditProfile, canEditPortal } = await loadOrgSettingsView({ params });
  return (
    <div className="flex flex-col gap-7">
      <OrgPageHeader
        organisation={{ name: org.name, slug: org.slug, logoUrl: org.logoUrl }}
        title="Settings"
        description={`How ${org.name} appears on its public page and join forms.`}
      />
      <SettingsTabs slug={org.slug} />

      <div className="flex min-w-0 flex-col gap-6">
        <EditOrgForm
          id="profile"
          organisationSlug={org.slug}
          canEdit={canEditProfile}
          initial={{
            name: org.name,
            description: org.description ?? "",
            logoUrl: org.logoUrl,
          }}
        />

        <section id="public-page" aria-labelledby="public-page-title" className={cn(sectionCard, "flex flex-col gap-4 md:flex-row md:items-center")}>
          <div className="min-w-0 flex-1">
            <h2 id="public-page-title" className="text-h4 text-ink">Public page</h2>
            <p className="mt-0.5 text-body-ui text-ink-muted">One link for your membership plans and join forms. The address can&apos;t be changed.</p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="max-w-full truncate rounded-full bg-muted px-3.5 py-2 tabular-nums text-sm text-ink-secondary">/o/{org.slug}</span>
            <CopyOrganisationUrl slug={org.slug} />
            <Link
              href={`/o/${org.slug}`}
              className="inline-flex min-h-9 items-center gap-1 px-2 text-sm font-semibold text-ink-secondary underline-offset-4 hover:text-ink hover:underline"
            >
              Open
              <ExternalLink aria-hidden className="size-3.5" />
            </Link>
          </div>
        </section>

        <section id="member-accounts" aria-labelledby="member-accounts-title" className={sectionCard}>
          <h2 id="member-accounts-title" className="mb-3 text-h4 text-ink">Member accounts</h2>
          <MemberPortalSwitch slug={org.slug} enabled={org.memberPortal} canEdit={canEditPortal} />
          <MemberPhotoUploadSwitch slug={org.slug} enabled={org.memberPhotoUpload} portal={org.memberPortal} canEdit={canEditPortal} />
        </section>

        {canDelete ? (
          <section
            id="danger-zone"
            aria-labelledby="danger-zone-title"
            className={cn(sectionCard, "flex flex-col gap-4 border-[1.5px] border-danger-border md:flex-row md:items-center")}
          >
            <div className="min-w-0 flex-1">
              <h2 id="danger-zone-title" className="text-h4 text-danger-fg">Delete organisation</h2>
              <p className="mt-0.5 text-body-ui text-ink-secondary">
                Permanently removes {org.name} with all of its plans, members, cards and team. You&apos;ll be asked to type the name to confirm.
              </p>
            </div>
            <div className="shrink-0">
              <DeleteOrganisationButton organisationSlug={org.slug} organisationName={org.name} />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
