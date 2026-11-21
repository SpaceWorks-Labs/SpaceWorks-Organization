import Link from "next/link";
import type { Metadata } from "next";
import { Send } from "lucide-react";
import { loadCertificatesView } from "@/lib/views/app__dashboard__orgSlug__certificates__page";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { DesignCards } from "@/components/certificates/DesignCards";
import { IssuedCertificatesTable } from "@/components/certificates/IssuedCertificatesTable";
import { NewDesignDialog } from "@/components/certificates/NewDesignDialog";
import { buttonClasses } from "@/components/ui/button";
import { Callout, EmptyState, SectionHeading } from "@/components/ui/display";

export const metadata: Metadata = { title: "Certificates", robots: { index: false, follow: false } };

type Props = { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ design?: string; status?: string; q?: string; page?: string }> };

export default async function CertificatesPage({ params, searchParams }: Props) {
  const view = await loadCertificatesView({ params, searchParams });
  const { org, designs } = view;
  const base = `/dashboard/${org.slug}/certificates`;
  const issuable = designs.some((design) => design.live && !design.archived);
  const current = designs.filter((design) => !design.archived);
  const archived = designs.filter((design) => design.archived);

  return (
    <div className="flex flex-col gap-6">
      <OrgPageHeader
        organisation={org}
        title="Certificates"
        description="Design certificates for anything you recognise (membership, appreciation, completion, office bearers) and issue them to members. Each carries a QR code anyone can check."
        actions={
          <>
            {view.canIssue && issuable ? (
              <Link href={`${base}/issue`} className={buttonClasses({ variant: view.canDesign ? "secondary" : "primary" })}>
                <Send aria-hidden className="size-4" />
                Issue certificates
              </Link>
            ) : null}
            {view.canDesign ? <NewDesignDialog organisationSlug={org.slug} /> : null}
          </>
        }
      />
      {view.scoped ? <Callout tone="info">You manage part of the organisation, so counts and certificates here cover only the members you can see.</Callout> : null}

      <section aria-labelledby="designs-heading" className="flex flex-col gap-3">
        <SectionHeading title={<span id="designs-heading">Designs</span>} description={view.canApprove ? "You approve each design before certificates are issued from it." : "The owner approves each design before certificates are issued from it."} />
        {current.length === 0 ? (
          <EmptyState patch title="No certificate designs yet" action={view.canDesign ? <NewDesignDialog organisationSlug={org.slug} /> : undefined}>
            {view.canDesign ? "Start a design for the first kind of certificate you give. It opens with a ready-made layout." : "Someone who designs certificates in your organisation adds them here."}
          </EmptyState>
        ) : (
          <DesignCards slug={org.slug} designs={current} canDesign={view.canDesign} canIssue={view.canIssue} />
        )}
        {archived.length ? (
          <details className="group rounded-xl border border-line bg-panel">
            <summary className="flex min-h-11 cursor-pointer items-center px-4 text-label text-ink">Archived designs ({archived.length})</summary>
            <div className="border-t border-line p-4">
              <DesignCards slug={org.slug} designs={archived} canDesign={view.canDesign} canIssue={false} />
            </div>
          </details>
        ) : null}
      </section>

      <section aria-labelledby="issued-heading" className="flex flex-col gap-3">
        <SectionHeading title={<span id="issued-heading">Issued certificates</span>} description="Newest first. Open one to download, email or revoke it." />
        <IssuedCertificatesTable base={base} designs={designs.map((design) => ({ id: design.id, name: design.name }))} filters={view.filters} certificates={view.certificates} canIssue={view.canIssue && issuable} timeZone={view.org.timeZone} />
      </section>
    </div>
  );
}
