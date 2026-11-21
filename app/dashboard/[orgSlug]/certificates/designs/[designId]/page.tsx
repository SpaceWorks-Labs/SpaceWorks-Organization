import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Send } from "lucide-react";
import { loadCertificateDesignerView } from "@/lib/views/app__dashboard__orgSlug__certificates__designs__designId__page";
import { CertificateDesigner } from "@/components/certificates/designer/CertificateDesigner";
import { CertificatePagePreview } from "@/components/certificates/CertificatePagePreview";
import { DesignLifecycleButton } from "@/components/certificates/DesignLifecycleButton";
import { buttonClasses } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { PAGE_SIZE_LABELS, ORIENTATION_LABELS } from "@/lib/certificates/pages";

export const metadata: Metadata = { title: "Certificate design", robots: { index: false, follow: false } };

export default async function CertificateDesignPage({ params }: { params: Promise<{ orgSlug: string; designId: string }> }) {
  const view = await loadCertificateDesignerView({ params });
  const { org, design, approval } = view;
  const base = `/dashboard/${org.slug}/certificates`;
  const editable = view.canEdit && !design.archived;
  return (
    <div className="flex flex-col gap-5">
      <Link href={base} className="inline-flex w-fit items-center gap-1 text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        Certificates
      </Link>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-h1 text-ink">{design.name}</h1>
          <p className="mt-1 text-body-ui text-ink-secondary">
            {design.typeLabel} · {PAGE_SIZE_LABELS[design.pageSize]}, {ORIENTATION_LABELS[design.orientation].toLowerCase()} · {design.issuedCount.toLocaleString("en-IN")} issued
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {approval.live && !design.archived ? (
            <Link href={`${base}/issue?design=${design.id}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
              <Send aria-hidden className="size-4" />
              Issue certificates
            </Link>
          ) : null}
          {view.canEdit ? <DesignLifecycleButton organisationSlug={org.slug} designId={design.id} designName={design.name} issuedCount={design.issuedCount} archived={design.archived} after="list" /> : null}
        </div>
      </header>
      {design.archived ? <Callout tone="info">This design is archived: its certificates stay valid, but none can be issued from it. Restore it to change it or issue from it again.</Callout> : null}
      {!view.canEdit ? <Callout tone="info">You manage part of the organisation, so certificate designs are read-only for you.</Callout> : null}
      {editable ? (
        <CertificateDesigner
          key={`${design.pageSize}-${design.orientation}-${approval.approvedAt}-${approval.hasDraft}`}
          organisationSlug={org.slug}
          organisationName={org.name}
          unitLevels={org.unitLevels}
          design={design}
          side={view.side}
          branding={view.branding}
          sample={view.sample}
          approval={approval}
          pageSizes={view.pageSizes}
          orientations={view.orientations}
          brandKit={view.brandKit}
        />
      ) : (
        <div className="max-w-4xl">
          <CertificatePagePreview side={view.side} holder={view.sample.holder} values={view.sample.values} branding={view.branding} label={`${design.name}, drawn with sample details`} />
        </div>
      )}
    </div>
  );
}
