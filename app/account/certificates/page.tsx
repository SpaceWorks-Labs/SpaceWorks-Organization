import Link from "next/link";
import type { Metadata } from "next";
import { FileImage, FileText, ShieldCheck } from "lucide-react";
import { loadAccountCertificatesView } from "@/lib/views/app__account__certificates__page";
import { formatIssuedDate } from "@/components/certificates/format";
import { EmptyState, SectionHeading } from "@/components/ui/display";

export const metadata: Metadata = { title: "Your certificates", robots: { index: false, follow: false } };

const LINK = "inline-flex min-h-11 items-center gap-1 text-caption font-semibold text-ink underline-offset-4 hover:underline";

export default async function AccountCertificatesPage() {
  const { certificates } = await loadAccountCertificatesView();
  return (
    <div className="flex flex-col gap-6">
      <SectionHeading as="h1" title="Your certificates" description="Certificates organisations have issued to you, ready to download or share." />
      {certificates.length === 0 ? (
        <EmptyState mood="waiting" title="No certificates yet">
          When an organisation issues you a certificate, it shows up here. We find them by your verified email address.
        </EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-panel px-5">
          {certificates.map((certificate) => (
            <li key={certificate.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-4">
              <span className="min-w-0 flex-[1_1_240px]">
                <span className="block break-words text-label font-semibold text-ink">{certificate.title}</span>
                <span className="text-caption text-ink-muted">
                  {certificate.organisation.name} · {formatIssuedDate(certificate.issuedAt, certificate.organisation.timezone)} · <span className="code-text">{certificate.number}</span>
                </span>
              </span>
              <span className="flex flex-wrap gap-x-4">
                <a href={certificate.downloads.pdf} className={LINK}><FileText aria-hidden className="size-3.5" />PDF<span className="sr-only"> of {certificate.title}</span></a>
                <a href={certificate.downloads.png} className={LINK}><FileImage aria-hidden className="size-3.5" />PNG<span className="sr-only"> of {certificate.title}</span></a>
                <Link href={certificate.verifyPath} prefetch={false} className={LINK}><ShieldCheck aria-hidden className="size-3.5" />Check link<span className="sr-only"> for {certificate.title}</span></Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
