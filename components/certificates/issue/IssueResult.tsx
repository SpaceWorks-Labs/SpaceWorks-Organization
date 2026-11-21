"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { BadgeCheck, FileArchive, FileText, Mail } from "lucide-react";
import { emailIssuedCertificates } from "@/app/actions/certificate-batch";
import type { IssueCertificatesResult } from "@/app/actions/certificates";
import { Button, buttonClasses } from "@/components/ui/button";
import { Callout, Card } from "@/components/ui/display";

/**
 * What one issue did: how many certificates were issued and how many members were skipped (and why), with the
 * next steps: email the new certificates (unless they were emailed as they were issued), download every
 * certificate of the design, see them in the list, or issue more. Focus moves to the heading when it appears.
 */
export function IssueResult({ organisationSlug, design, result, emailed, onAgain }: {
  organisationSlug: string;
  design: { id: string; name: string };
  result: IssueCertificatesResult;
  emailed: boolean;
  onAgain: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [mail, setMail] = useState<{ ok: boolean; text: string } | null>(emailed && result.issued ? { ok: true, text: `Emails with the PDF are queued for the ${result.issued === 1 ? "member" : "members"}.` } : null);
  const [busy, startTransition] = useTransition();
  useEffect(() => heading.current?.focus(), []);
  const base = `/dashboard/${organisationSlug}/certificates`;
  const exportUrl = (format: "zip" | "pdf") => `/api/exports/certificates/${encodeURIComponent(organisationSlug)}?${new URLSearchParams({ design: design.id, format })}`;
  const plural = (count: number, one: string, many: string) => `${count.toLocaleString("en-IN")} ${count === 1 ? one : many}`;

  const email = () => startTransition(async () => {
    const response = await emailIssuedCertificates({ organisationSlug, certificateIds: result.certificateIds });
    if (!response.ok || !response.data) return setMail({ ok: false, text: response.ok ? "The emails weren't queued. Try again." : response.error });
    const { queued, skipped } = response.data;
    setMail({ ok: true, text: `${plural(queued, "email is", "emails are")} queued with the PDF.${skipped ? ` ${plural(skipped, "certificate was", "certificates were")} emailed in the last ten minutes or can't be emailed now, so ${skipped === 1 ? "it was" : "they were"} left out.` : ""}` });
  });

  return (
    <Card as="section" aria-labelledby="issue-result" className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <BadgeCheck aria-hidden className="mt-0.5 size-7 shrink-0 text-success-fg" />
        <div className="min-w-0">
          <h2 id="issue-result" ref={heading} tabIndex={-1} className="text-h3 text-ink focus:outline-none">{result.issued ? `${plural(result.issued, "certificate", "certificates")} issued` : "No new certificates"}</h2>
          <p className="text-body-ui text-ink-secondary">{design.name}</p>
        </div>
      </div>
      {result.skipped ? (
        <Callout tone="info" title={`${plural(result.skipped, "member", "members")} skipped`}>
          They already hold a valid certificate of this design with this title, or their record was erased meanwhile. Nobody gets the same certificate twice.
        </Callout>
      ) : null}
      {mail ? <Callout tone={mail.ok ? "success" : "danger"} role={mail.ok ? "status" : "alert"}>{mail.text}</Callout> : null}
      <div className="flex flex-wrap gap-2">
        {result.issued && !emailed ? <Button variant="primary" startIcon={<Mail />} loading={busy} disabled={Boolean(mail?.ok)} onClick={email}>{busy ? "Queuing emails…" : "Email them"}</Button> : null}
        <a href={exportUrl("zip")} className={buttonClasses({ variant: "secondary" })}><FileArchive aria-hidden className="size-4" />Download ZIP</a>
        <a href={exportUrl("pdf")} className={buttonClasses({ variant: "secondary" })}><FileText aria-hidden className="size-4" />Download combined PDF</a>
      </div>
      <p className="text-caption text-ink-muted">Downloads hold every valid certificate of this design you can see (up to 200 in a ZIP, 500 in one PDF), not just these.</p>
      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-4">
        <Link href={`${base}?design=${design.id}`} className="inline-flex min-h-11 items-center text-label font-semibold text-ink underline-offset-4 hover:underline">See them in the list</Link>
        <button type="button" onClick={onAgain} className="inline-flex min-h-11 items-center text-label font-semibold text-ink underline-offset-4 hover:underline">Issue more certificates</button>
      </div>
    </Card>
  );
}
