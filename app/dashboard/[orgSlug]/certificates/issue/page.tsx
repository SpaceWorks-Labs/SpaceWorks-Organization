import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { loadCertificateIssueView } from "@/lib/views/app__dashboard__orgSlug__certificates__issue__page";
import { loadIssueRecipient } from "@/lib/views/app__dashboard__orgSlug__certificates__issue__recipient";
import { IssueForm } from "@/components/certificates/issue/IssueForm";
import { buttonClasses } from "@/components/ui/button";
import { Callout, EmptyState } from "@/components/ui/display";

export const metadata: Metadata = { title: "Issue certificates", robots: { index: false, follow: false } };

export default async function IssueCertificatesPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ design?: string; member?: string }> }) {
  const view = await loadCertificateIssueView({ params, searchParams });
  const recipient = await loadIssueRecipient({ params, searchParams });
  const base = `/dashboard/${view.org.slug}/certificates`;
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Link href={base} className="inline-flex w-fit items-center gap-1 text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        Certificates
      </Link>
      <header>
        <h1 className="text-h1 text-ink">Issue certificates</h1>
        <p className="mt-1 text-body-ui text-ink-secondary">Each member gets their own numbered certificate with a QR code anyone can check.</p>
      </header>
      {view.scoped ? <Callout tone="info">You manage part of the organisation, so you can issue certificates only to the members you can see.</Callout> : null}
      {view.designs.length === 0 ? (
        <EmptyState
          mood="waiting"
          title="No approved designs yet"
          action={view.canDesign ? <Link href={base} className={buttonClasses({ variant: "secondary" })}>Go to designs</Link> : undefined}
        >
          Certificates are issued from a design the owner has approved. {view.canDesign ? "Start or finish a design, then ask the owner to approve it." : "Ask someone who designs certificates to prepare one."}
        </EmptyState>
      ) : (
        <IssueForm
          organisationSlug={view.org.slug}
          designs={view.designs.map((design) => ({ id: design.id, name: design.name, typeLabel: design.typeLabel }))}
          selectedDesignId={view.selectedDesignId}
          plans={view.plans}
          groups={view.groups}
          limit={view.limit}
          initialMember={recipient}
        />
      )}
    </div>
  );
}
