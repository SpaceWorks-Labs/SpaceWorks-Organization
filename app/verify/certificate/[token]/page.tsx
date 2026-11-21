import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, CircleAlert, ShieldX } from "lucide-react";
import { loadCertificateVerifyView } from "@/lib/views/app__verify__certificate__token__page";
import { Callout, Chip, OrgLogo } from "@/components/ui/display";
import styles from "@/components/public/motion/motion.module.css";
import { CertificateScanPanel } from "@/components/certificates/CertificateScanPanel";
import { STAFF_AUTHENTICATOR_MESSAGE, STAFF_AUTHENTICATOR_SETUP } from "@/lib/permissionRoles";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

// The token is in the URL: keep it out of search engines and out of Referer headers.
export const metadata: Metadata = { title: "Check a certificate", robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };

type View = Awaited<ReturnType<typeof loadCertificateVerifyView>>["view"];

function checked(at: Date, timeZone = "UTC") {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" }).format(at);
}

function Plain({ title, word, children }: { title: string; word: string; children: React.ReactNode }) {
  return (
    <section className={cn("flex flex-col items-center gap-3 rounded-xl border border-line bg-panel p-8 text-center", styles.arrive)}>
      <Chip tone="neutral">{word}</Chip>
      <CircleAlert aria-hidden className="size-10 text-ink-muted" />
      <h1 className="text-h2 text-ink">{title}</h1>
      <p className="max-w-prose text-body-ui text-ink-secondary">{children}</p>
    </section>
  );
}

/*
 * Like the card check: the verdict is a large callout (soft fill and tone ink, CR-STATUS-01) whose small mark says
 * the result in a word. A valid certificate gets the one-off stamp; both are CSS only and skipped under reduced motion.
 */
function Verdict({ view }: { view: Extract<View, { state: "certificate" }> }) {
  const valid = view.verdict === "valid";
  const Icon = valid ? BadgeCheck : ShieldX;
  return (
    <>
      <header className="flex items-center gap-3">
        <OrgLogo name={view.organisationName} src={view.organisationLogoUrl} size="md" />
        <p className="min-w-0 text-label font-semibold text-ink">{view.organisationName}</p>
      </header>
      <section aria-labelledby="verdict" className={cn("flex flex-col gap-5 rounded-xl border p-6", styles.arrive, valid ? "border-line bg-success-bg" : "border-danger-border bg-danger-bg")}>
        <span className={cn("w-fit", valid && styles.stamp)}><Chip tone={valid ? "success" : "danger"}>{valid ? "Valid" : "Not valid"}</Chip></span>
        <div className={cn("flex items-center gap-3", valid ? "text-success-fg" : "text-danger-fg")}>
          <Icon aria-hidden className="size-9 shrink-0" />
          <div>
            <h1 id="verdict" className="text-h2">{valid ? "Genuine certificate" : "Certificate revoked"}</h1>
            <p className="text-body-ui text-ink-secondary">{valid ? `${view.organisationName} issued this certificate and it is still valid.` : `${view.organisationName} has revoked this certificate. It is no longer proof of anything.`}</p>
          </div>
        </div>
        <div className="border-t border-line pt-5">
          <p className="break-words text-h3 text-ink">{view.title}</p>
          {view.memberName ? <p className="text-body-ui text-ink-secondary">Awarded to <span className="font-semibold text-ink">{view.memberName}</span></p> : null}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-body-ui">
          <div>
            <dt className="text-caption text-ink-muted">Issued</dt>
            <dd className="font-semibold tabular-nums text-ink">{view.issuedOn}</dd>
          </div>
          <div>
            <dt className="text-caption text-ink-muted">Certificate number</dt>
            <dd className="code-text break-all font-semibold text-ink">{view.certificateNumber}</dd>
          </div>
        </dl>
      </section>
    </>
  );
}

export default async function VerifyCertificatePage({ params }: { params: Promise<{ token: string }> }) {
  const { view, checkedAt, staff } = await loadCertificateVerifyView({ params });
  let body: React.ReactNode;
  if (view.state === "certificate") body = <Verdict view={view} />;
  else if (view.state === "not-found") body = <Plain title="Certificate not recognised" word="Not valid">This QR code doesn&apos;t match a certificate we know. Ask the person who showed it for another proof.</Plain>;
  else body = <Plain title="Organisation suspended" word="Can't check">{view.organisationName} is suspended on this platform, so its certificates can&apos;t be checked right now.</Plain>;
  return (
    <div className={cn("mx-auto flex w-full flex-col gap-5 px-4 py-8 sm:py-12", staff?.state === "panel" ? "max-w-3xl" : "max-w-[30rem]")}>
      {body}
      {staff?.state === "authenticator" ? (
        <Callout tone="warning" title="Set up an authenticator app to manage this certificate" action={<Link href={STAFF_AUTHENTICATOR_SETUP} className="font-semibold underline underline-offset-4">Set up an authenticator</Link>}>
          {STAFF_AUTHENTICATOR_MESSAGE}
        </Callout>
      ) : null}
      {staff?.state === "panel" ? <CertificateScanPanel staff={staff} /> : null}
      <p className="text-center text-caption text-ink-muted">
        Checked {checked(checkedAt, view.state === "certificate" ? view.timeZone : undefined)}. {staff?.state === "panel" ? "Only your organisation's record of this certificate is shown." : "This page shows the certificate as the organisation records it and never shows contact details."}
      </p>
    </div>
  );
}
