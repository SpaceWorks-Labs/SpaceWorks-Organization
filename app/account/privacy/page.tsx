import Link from "next/link";
import type { Metadata } from "next";
import { Download } from "lucide-react";
import { loadAccountPrivacyView } from "@/lib/views/app__account__privacy__page";
import { formatCalendarDate, localDate } from "@/lib/membership/periods";
import { PrivacyOrganisation } from "@/components/portal/PrivacyOrganisation";
import { buttonClasses } from "@/components/ui/button";
import { Callout, Card, CardHeader, SectionHeading } from "@/components/ui/display";

export const metadata: Metadata = { title: "Privacy and your data" };

export default async function AccountPrivacyPage() {
  const { emailVerified, organisations } = await loadAccountPrivacyView();
  return (
    <div className="flex flex-col gap-6">
      <SectionHeading as="h1" title="Privacy and your data" description="See what you agreed to, take a copy of your data, or ask for it to be erased." />
      <Card as="section" className="rounded-xl">
        <CardHeader
          titleAs="h3"
          title="Download your data"
          description="Your account, your team roles and your member records in every organisation. Up to 5 downloads an hour."
        />
        <div className="flex flex-wrap gap-2">
          {/* Plain links: these are file downloads, not page navigations. */}
          <a href="/api/exports/account" download className={buttonClasses({ variant: "primary", size: "sm" })}>
            <Download aria-hidden className="size-4" />
            Download everything (JSON)
          </a>
          <a href="/api/exports/account?format=csv" download className={buttonClasses({ variant: "secondary", size: "sm" })}>
            <Download aria-hidden className="size-4" />
            Download memberships (CSV)
          </a>
        </div>
      </Card>
      {!emailVerified ? (
        <Callout tone="warning" title="Verify your email to manage your memberships' data" action={<Link href="/account/profile" className={buttonClasses({ variant: "secondary", size: "sm" })}>Verify your email</Link>}>
          Organisations know you by your email address.
        </Callout>
      ) : organisations.map((entry) => {
        const day = (date: Date) => formatCalendarDate(localDate(date, entry.organisation.timezone));
        const erasure = entry.latestErasure;
        return (
          <PrivacyOrganisation
            key={entry.memberId}
            organisation={entry.organisation}
            consents={entry.consents.map((consent) => ({
              id: consent.id, purpose: consent.purpose, noticeVersion: consent.noticeVersion, byGuardian: consent.byGuardian,
              granted: day(consent.grantedAt), withdrawn: consent.withdrawnAt ? day(consent.withdrawnAt) : null,
            }))}
            erasure={erasure ? { id: erasure.id, status: erasure.status, requested: day(erasure.createdAt), decided: erasure.decidedAt ? day(erasure.decidedAt) : null, note: erasure.decisionNote } : null}
          />
        );
      })}
    </div>
  );
}
