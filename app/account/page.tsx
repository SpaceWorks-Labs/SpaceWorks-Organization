import Link from "next/link";
import type { Metadata } from "next";
import { loadAccountWalletView } from "@/lib/views/app__account__page";
import { WalletCard } from "@/components/portal/WalletCard";
import { buttonClasses } from "@/components/ui/button";
import { Callout, EmptyState, SectionHeading } from "@/components/ui/display";

export const metadata: Metadata = { title: "Your memberships" };

export default async function AccountWalletPage() {
  const { wallet, emailVerified, cards } = await loadAccountWalletView();
  return (
    <div className="flex flex-col gap-6">
      <SectionHeading as="h1" title="Your memberships" description="Every organisation you belong to, in one place." />
      {!emailVerified ? (
        <Callout
          tone="warning"
          title="Verify your email to see your memberships"
          action={<Link href="/account/profile" className={buttonClasses({ variant: "secondary", size: "sm" })}>Verify your email</Link>}
        >
          Organisations know you by your email address, so we show your memberships once it&apos;s verified.
        </Callout>
      ) : wallet.length === 0 ? (
        <EmptyState
          mood="waiting"
          title="No memberships yet"
          action={<Link href="/organisations" className={buttonClasses({ variant: "secondary", size: "sm" })}>Find an organisation</Link>}
        >
          When you join an organisation with this email address, your membership shows up here.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-5">
          {wallet.map((entry) => <WalletCard key={entry.memberId} entry={entry} cards={cards.filter((card) => card.memberId === entry.memberId)} />)}
        </div>
      )}
    </div>
  );
}
