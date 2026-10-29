import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, CircleAlert, Clock, ShieldX } from "lucide-react";
import { loadVerifyView } from "@/lib/views/app__verify__token__page";
import { VERDICT_LABELS, type VerifyVerdict, type VerifyView } from "@/lib/cards/verify";
import { Avatar, Callout, OrgLogo } from "@/components/ui/display";
import { StaffScanPanel } from "@/components/cards/StaffScanPanel";
import { STAFF_AUTHENTICATOR_MESSAGE, STAFF_AUTHENTICATOR_SETUP } from "@/lib/permissionRoles";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

// The token is in the URL: keep it out of search engines and out of Referer headers.
export const metadata: Metadata = { title: "Check a member card", robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };

const TONES: Record<VerifyVerdict, { panel: string; text: string; Icon: typeof BadgeCheck; note: string }> = {
  valid: { panel: "border-success-fg/30 bg-success-bg", text: "text-success-fg", Icon: BadgeCheck, note: "This membership is current." },
  grace: { panel: "border-warning-fg/30 bg-warning-bg", text: "text-warning-fg", Icon: Clock, note: "The membership has ended and is in its renewal grace period." },
  "not-yet": { panel: "border-info-fg/30 bg-info-bg", text: "text-info-fg", Icon: Clock, note: "This membership has not started yet." },
  expired: { panel: "border-line-strong bg-subtle", text: "text-ink", Icon: CircleAlert, note: "This card belongs to someone who is not a current member." },
  revoked: { panel: "border-danger-border bg-danger-bg", text: "text-danger-fg", Icon: ShieldX, note: "The organisation revoked this membership." },
};

function checked(at: Date, timeZone = "UTC") {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" }).format(at);
}

function Plain({ title, children, tone = "neutral" }: { title: string; children: React.ReactNode; tone?: "neutral" | "danger" }) {
  return (
    <section className={cn("flex flex-col items-center gap-3 rounded-2xl border p-8 text-center", tone === "danger" ? "border-danger-border bg-danger-bg" : "border-line bg-panel")}>
      {tone === "danger" ? <ShieldX aria-hidden className="size-10 text-danger-fg" /> : <CircleAlert aria-hidden className="size-10 text-ink-muted" />}
      <h1 className={cn("text-h2", tone === "danger" ? "text-danger-fg" : "text-ink")}>{title}</h1>
      <p className="max-w-prose text-body-ui text-ink-secondary">{children}</p>
    </section>
  );
}

type MemberView = Extract<VerifyView, { state: "member" }>;
type CardImages = { front: string; back: string | null } | null;

function MemberVerdict({ view, images }: { view: MemberView; images: CardImages }) {
  const tone = TONES[view.verdict];
  return (
    <>
      <header className="flex items-center gap-3">
        <OrgLogo name={view.organisationName} src={view.organisationLogoUrl} size="md" />
        <p className="min-w-0 text-label font-semibold text-ink">{view.organisationName}</p>
      </header>
      <section aria-labelledby="verdict" className={cn("flex flex-col gap-5 rounded-2xl border p-6", tone.panel)}>
        <div className={cn("flex items-center gap-3", tone.text)}>
          <tone.Icon aria-hidden className="size-9 shrink-0" />
          <div>
            <h1 id="verdict" className="text-h2">{VERDICT_LABELS[view.verdict]}</h1>
            <p className="text-body-ui text-ink-secondary">{tone.note}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 border-t border-line pt-5">
          <Avatar name={view.name} src={view.photoUrl} size="lg" />
          <div className="min-w-0">
            <p className="break-words text-h3 text-ink">{view.name}</p>
            <p className="text-body-ui text-ink-secondary">{view.planName}</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-body-ui">
          <div>
            <dt className="text-caption text-ink-muted">Valid until</dt>
            <dd className="font-semibold tabular-nums text-ink">{view.validUntil ?? "No current membership"}</dd>
          </div>
          <div>
            <dt className="text-caption text-ink-muted">Card number</dt>
            <dd className="font-semibold tabular-nums text-ink">{view.cardNumber}</dd>
          </div>
        </dl>
      </section>
      {images ? (
        <section aria-label="Membership card" className="flex flex-col gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- drawn on demand for this check, never cached */}
          <img src={images.front} alt={`Front of ${view.name}'s membership card`} className="h-auto w-full rounded-xl shadow-md" />
          {/* eslint-disable-next-line @next/next/no-img-element -- drawn on demand for this check, never cached */}
          {images.back ? <img src={images.back} alt={`Back of ${view.name}'s membership card`} className="h-auto w-full rounded-xl shadow-md" /> : null}
        </section>
      ) : null}
    </>
  );
}

export default async function VerifyCardPage({ params }: { params: Promise<{ token: string }> }) {
  const { view, checkedAt, images, staff } = await loadVerifyView({ params });
  let body: React.ReactNode;
  if (view.state === "member") body = <MemberVerdict view={view} images={images} />;
  else if (view.state === "not-found") body = <Plain title="Card not recognised">This QR code doesn&apos;t match a card we know. Ask the holder for another form of membership proof.</Plain>;
  else if (view.state === "card-revoked") body = <Plain title="Card revoked" tone="danger">{view.organisationName} has revoked this card. It is no longer proof of membership.</Plain>;
  else if (view.state === "card-replaced") body = <Plain title="Card replaced" tone="danger">{view.organisationName} issued a newer card to replace this one. Ask the holder for their current card.</Plain>;
  else body = <Plain title="Organisation suspended">{view.organisationName} is suspended on this platform, so its cards can&apos;t be checked right now.</Plain>;
  return (
    <div className={cn("mx-auto flex w-full flex-col gap-5 px-4 py-8 sm:py-12", staff?.state === "panel" ? "max-w-3xl" : "max-w-[30rem]")}>
      {body}
      {staff?.state === "authenticator" ? (
        <Callout tone="warning" title="Set up an authenticator app to manage this member" action={<Link href={STAFF_AUTHENTICATOR_SETUP} className="font-semibold underline underline-offset-4">Set up an authenticator</Link>}>
          {STAFF_AUTHENTICATOR_MESSAGE}
        </Callout>
      ) : null}
      {staff?.state === "panel" ? <StaffScanPanel staff={staff} /> : null}
      <p className="text-center text-caption text-ink-muted">
        Checked {checked(checkedAt, view.state === "member" ? view.timeZone : undefined)}. {staff?.state === "panel" ? "Only your organisation's record of this member is shown." : "This page shows the membership as the organisation records it and never shows contact details."}
      </p>
    </div>
  );
}
