import { Card, CardHeader } from "@/components/ui/display";
import { formatIssuedDateTime } from "./format";

type Certificate = { issuedAt: string; issuedByName: string | null; emailedAt: string | null; revokedAt: string | null; revokedByName: string | null; revokedReason: string | null };

/** What happened to the certificate, newest first: issued, last emailed and revoked, with who did it. */
export function CertificateHistory({ certificate, timeZone }: { certificate: Certificate; timeZone?: string }) {
  const events = [
    { at: certificate.issuedAt, title: "Issued", detail: certificate.issuedByName ? `By ${certificate.issuedByName}` : null },
    ...(certificate.emailedAt ? [{ at: certificate.emailedAt, title: "Emailed to the member", detail: "The most recent email with the PDF" }] : []),
    ...(certificate.revokedAt ? [{ at: certificate.revokedAt, title: "Revoked", detail: [certificate.revokedByName ? `By ${certificate.revokedByName}` : null, certificate.revokedReason].filter(Boolean).join(": ") || null }] : []),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Card as="section">
      <CardHeader title="History" />
      <ol className="flex flex-col gap-3">
        {events.map((event) => (
          <li key={`${event.title}-${event.at}`} className="flex flex-col border-l-2 border-line pl-4">
            <span className="text-label font-semibold text-ink">{event.title}</span>
            <span className="text-caption text-ink-muted"><time dateTime={event.at}>{formatIssuedDateTime(event.at, timeZone)}</time>{event.detail ? ` · ${event.detail}` : ""}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
