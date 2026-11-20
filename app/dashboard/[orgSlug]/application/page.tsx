import Link from "next/link";
import type { Metadata } from "next";
import { loadOrgApplicationView } from "@/lib/views/app__dashboard__orgSlug__application__page";
import { STATUS_EXPLANATIONS } from "@/lib/organisationLifecycle";
import { Patch } from "@/components/brand/Patch";
import { indianStateName } from "@/lib/indianStates";
import { OrganisationStatusChip } from "@/components/org/OrganisationStatusChip";
import { ReviewHistory } from "@/components/super-admin/ReviewHistory";
import { ResubmitApplicationForm } from "@/components/onboarding/ResubmitApplicationForm";
import { buttonClasses } from "@/components/ui/button";
import { Callout, Card, CardHeader, DetailList, PageHeader, type CalloutTone } from "@/components/ui/display";

export const metadata: Metadata = { title: "Application", robots: { index: false, follow: false } };

const TONES: Record<string, CalloutTone> = {
  PENDING_REVIEW: "info",
  CHANGES_REQUESTED: "warning",
  ACTIVE: "success",
  REJECTED: "danger",
  SUSPENDED: "danger",
  ARCHIVED: "info",
};

export default async function OrgApplicationPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { organisation, reviews, latestNote, canEdit, isManager } = await loadOrgApplicationView({ params });
  const explanation = STATUS_EXPLANATIONS[organisation.status];
  const showNote = latestNote && organisation.status !== "ACTIVE";
  return (
    <div className="flex max-w-[860px] flex-col gap-6">
      <PageHeader
        kicker={<OrganisationStatusChip status={organisation.status} size="md" />}
        title={organisation.status === "ACTIVE" ? "Organisation status" : "Your application"}
        description={`${organisation.name} · applied ${organisation.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`}
      />

      {/* Approval is the platform letting a new pack in, so Patch sneezes its vote once (unless playful touches are off). */}
      <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center">
        {organisation.status === "ACTIVE" && organisation.delightEnabled ? <Patch pose="sneeze" size={96} className="-my-3 -ml-3" /> : null}
        <Callout
          tone={TONES[organisation.status]}
          title={explanation.title}
          role="status"
          className="w-full min-w-0 flex-1"
          action={organisation.status === "ACTIVE" ? <Link href={`/dashboard/${organisation.slug}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>Open dashboard</Link> : undefined}
        >
          {explanation.body}
        </Callout>
      </div>

      {showNote ? (
        <Card as="section" className="rounded-xl">
          <CardHeader title="Note from the platform team" />
          <p className="whitespace-pre-wrap text-body-ui text-ink">{latestNote}</p>
        </Card>
      ) : null}

      <div className={canEdit ? "flex flex-col gap-6" : "grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]"}>
        <Card as="section" className="rounded-xl">
          {canEdit ? (
            <>
              <CardHeader title="Update your application" description="Change what the note asks for, then send it again. The platform team is told straight away." />
              <ResubmitApplicationForm
                organisationSlug={organisation.slug}
                initial={{
                  name: organisation.name,
                  kind: organisation.kind,
                  description: organisation.description,
                  contactEmail: organisation.contactEmail ?? "",
                  contactPhone: organisation.contactPhone ?? "",
                  website: organisation.website ?? "",
                  addressLine: organisation.addressLine ?? "",
                  city: organisation.city ?? "",
                  stateCode: organisation.stateCode ?? "",
                  postalCode: organisation.postalCode ?? "",
                }}
              />
            </>
          ) : (
            <>
              <CardHeader
                title="What you told us"
                description={organisation.status === "CHANGES_REQUESTED" && !isManager ? "An owner or manager can update the application." : undefined}
              />
              <DetailList
                items={[
                  { label: "Name", value: organisation.name },
                  { label: "Web address", value: `/o/${organisation.slug}` },
                  { label: "Kind", value: organisation.kind || "Not given" },
                  { label: "Description", value: <span className="whitespace-pre-wrap">{organisation.description || "Not given"}</span> },
                  { label: "Email", value: organisation.contactEmail ?? "Not given" },
                  { label: "Phone", value: organisation.contactPhone ?? "Not given" },
                  { label: "Website", value: organisation.website ?? "Not given" },
                  { label: "Address", value: [organisation.addressLine, organisation.city, indianStateName(organisation.stateCode), organisation.postalCode].filter(Boolean).join(", ") || "Not given" },
                ]}
              />
            </>
          )}
        </Card>
        <Card as="section" className="h-fit rounded-xl">
          <CardHeader title="History" titleAs="h2" />
          <ReviewHistory reviews={reviews} showActor={false} />
        </Card>
      </div>
    </div>
  );
}
