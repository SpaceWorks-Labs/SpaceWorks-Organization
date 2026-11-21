import Link from "next/link";
import { FileImage, FileText } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader, Chip, DetailList } from "@/components/ui/display";
import { CERTIFICATE_STATE_LABELS } from "@/lib/certificates/core";
import type { loadCertificateVerifyView } from "@/lib/views/app__verify__certificate__token__page";
import { formatIssuedDate } from "./format";

type Panel = Extract<NonNullable<Awaited<ReturnType<typeof loadCertificateVerifyView>>["staff"]>, { state: "panel" }>;

/**
 * What staff of the certificate's organisation see after scanning it: their own record of the certificate (with the
 * reason it was revoked), its downloads, and links to its page and the member's, where the actions live.
 */
export function CertificateScanPanel({ staff }: { staff: Panel }) {
  const { certificate, member, paths, downloads, timeZone } = staff;
  const valid = certificate.state === "valid";
  return (
    <Card as="section" className="rounded-xl">
      <CardHeader
        title={certificate.title}
        description={`Your record of this certificate, issued to ${member.name}.`}
        action={
          <span className="flex flex-wrap gap-2">
            <Link href={paths.certificate} className={buttonClasses({ variant: "secondary", size: "sm" })}>Open certificate page</Link>
            <Link href={paths.member} className={buttonClasses({ variant: "quiet", size: "sm" })}>Open member page</Link>
          </span>
        }
      />
      <DetailList
        items={[
          { label: "Status", value: <Chip size="sm" tone={valid ? "success" : "danger"}>{CERTIFICATE_STATE_LABELS[certificate.state]}</Chip> },
          { label: "Number", value: <span className="code-text">{certificate.number}</span> },
          { label: "Design", value: certificate.designName },
          { label: "Issued", value: formatIssuedDate(certificate.issuedAt, timeZone) },
          ...(certificate.reason ? [{ label: "Reason", value: <span className="whitespace-pre-line">{certificate.reason}</span> }] : []),
          ...(certificate.emailedAt ? [{ label: "Last emailed", value: formatIssuedDate(certificate.emailedAt, timeZone) }] : []),
          ...(certificate.revokedAt ? [{ label: "Revoked", value: `${formatIssuedDate(certificate.revokedAt, timeZone)}${certificate.revokedReason ? `: ${certificate.revokedReason}` : ""}` }] : []),
        ]}
      />
      {staff.canIssue ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          <a href={downloads.pdf} className={buttonClasses({ variant: "secondary", size: "sm" })}><FileText aria-hidden className="size-4" />Download PDF</a>
          <a href={downloads.png} className={buttonClasses({ variant: "secondary", size: "sm" })}><FileImage aria-hidden className="size-4" />Download PNG</a>
        </div>
      ) : null}
    </Card>
  );
}
