import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, ExternalLink, FileImage, FileText } from "lucide-react";
import { loadCertificateDetailView } from "@/lib/views/app__dashboard__orgSlug__certificates__certificateId__page";
import { CertificateActions } from "@/components/certificates/CertificateActions";
import { CertificateHistory } from "@/components/certificates/CertificateHistory";
import { CertificateImagePreview } from "@/components/certificates/CertificateImagePreview";
import { formatIssuedDate } from "@/components/certificates/format";
import { buttonClasses } from "@/components/ui/button";
import { Callout, Card, CardHeader, Chip, DetailList } from "@/components/ui/display";
import { CERTIFICATE_STATE_LABELS } from "@/lib/certificates/core";

export const metadata: Metadata = { title: "Certificate", robots: { index: false, follow: false } };

export default async function CertificatePage({ params }: { params: Promise<{ orgSlug: string; certificateId: string }> }) {
  const view = await loadCertificateDetailView({ params });
  const { org, certificate, member, design } = view;
  const valid = certificate.state === "valid";
  return (
    <div className="flex flex-col gap-6">
      <Link href={`/dashboard/${org.slug}/certificates`} className="inline-flex w-fit items-center gap-1 text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        Certificates
      </Link>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="code-text text-caption text-ink-muted">{certificate.number}</p>
          <h1 className="break-words text-h1 text-ink">{certificate.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-body-ui text-ink-secondary">
            <Chip tone={valid ? "success" : "danger"}>{CERTIFICATE_STATE_LABELS[certificate.state]}</Chip>
            <span>
              Issued to <Link href={`/dashboard/${org.slug}/members/${member.id}`} className="font-semibold text-ink underline underline-offset-4">{member.name}</Link> on {formatIssuedDate(certificate.issuedAt, org.timeZone)}
            </span>
          </p>
        </div>
        <CertificateActions organisationSlug={org.slug} certificateId={certificate.id} memberName={member.name} title={certificate.title} canEmail={view.canEmail} canRevoke={view.canRevoke} />
      </header>
      {!valid ? (
        <Callout tone="danger" title="Revoked">
          {certificate.revokedReason ? `Reason: ${certificate.revokedReason}. ` : ""}Its check page shows it as revoked and no longer names the member.
        </Callout>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section aria-label="Certificate preview" className="flex min-w-0 flex-col gap-3">
          <CertificateImagePreview src={view.downloads.png} widthMm={design.widthMm} heightMm={design.heightMm} alt={`${certificate.title} for ${member.name}`} />
          <div className="flex flex-wrap gap-2">
            <a href={view.downloads.pdf} className={buttonClasses({ variant: "secondary", size: "sm" })}><FileText aria-hidden className="size-4" />Download PDF</a>
            <a href={view.downloads.png} className={buttonClasses({ variant: "secondary", size: "sm" })}><FileImage aria-hidden className="size-4" />Download PNG</a>
            <a href={view.verifyPath} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "quiet", size: "sm" })}><ExternalLink aria-hidden className="size-4" />Open the check page</a>
          </div>
        </section>
        <div className="flex min-w-0 flex-col gap-6">
          <Card as="section">
            <CardHeader title="Details" />
            <DetailList
              items={[
                { label: "Member", value: <Link href={`/dashboard/${org.slug}/members/${member.id}`} className="text-ink underline underline-offset-4">{member.name}</Link> },
                ...(member.unitName ? [{ label: "Unit", value: member.unitName }] : []),
                { label: "Number", value: <span className="code-text">{certificate.number}</span> },
                { label: "Design", value: `${design.name}${design.archived ? " (archived)" : ""}` },
                ...(certificate.reason ? [{ label: "Reason", value: <span className="whitespace-pre-line">{certificate.reason}</span> }] : []),
              ]}
            />
          </Card>
          <CertificateHistory certificate={certificate} timeZone={org.timeZone} />
        </div>
      </div>
    </div>
  );
}
