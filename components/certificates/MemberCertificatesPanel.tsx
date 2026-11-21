import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader, Chip } from "@/components/ui/display";
import { CERTIFICATE_STATE_LABELS, type CertificateState } from "@/lib/certificates/core";
import { formatIssuedDate } from "./format";

type Row = { id: string; number: string; title: string; issuedAt: string; state: CertificateState };

/** One member's certificates on their page, newest first, each opening its own page; "Issue certificate" for issuers. */
export function MemberCertificatesPanel({ slug, memberId, data, timeZone }: { slug: string; memberId: string; data: { certificates: Row[]; canIssue: boolean }; timeZone?: string }) {
  const base = `/dashboard/${slug}/certificates`;
  return (
    <Card as="section" className="rounded-xl">
      <CardHeader
        title="Certificates"
        action={data.canIssue ? (
          <Link href={`${base}/issue?member=${memberId}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
            <Plus aria-hidden className="size-4" />
            Issue certificate
          </Link>
        ) : undefined}
      />
      {data.certificates.length === 0 ? (
        <p className="text-body-ui text-ink-muted">No certificates yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {data.certificates.map((certificate) => (
            <li key={certificate.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="min-w-0">
                <Link href={`${base}/${certificate.id}`} className="block break-words text-label font-semibold text-ink underline-offset-4 hover:underline">{certificate.title}</Link>
                <span className="text-caption text-ink-muted"><span className="code-text">{certificate.number}</span> · {formatIssuedDate(certificate.issuedAt, timeZone)}</span>
              </span>
              <Chip size="sm" tone={certificate.state === "valid" ? "success" : "danger"}>{CERTIFICATE_STATE_LABELS[certificate.state]}</Chip>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
