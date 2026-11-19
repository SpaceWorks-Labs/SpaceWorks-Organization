import { loadAccountSecurityView } from "@/lib/views/app__account__security__page";
import type { Metadata } from "next";
import { AccountSecurityClient } from "@/components/security/AccountSecurityClient";
import { AccountPasswordForm } from "@/components/account/AccountPasswordForm";
import { SignInMethodsCard } from "@/components/security/SignInMethodsCard";
import { SecurityActivityCard } from "@/components/security/SecurityActivityCard";
import { SignOutEverywhereCard } from "@/components/security/SignOutEverywhereCard";
import { SignedInDevicesCard } from "@/components/security/SignedInDevicesCard";
import { RecoveryCodesCard } from "@/components/security/RecoveryCodesCard";
import { PasskeysCard } from "@/components/security/PasskeysCard";
import { PhoneCard } from "@/components/security/PhoneCard";
import { loadPasskeysView } from "@/lib/views/components__security__passkeys";
import { securityActivityLabel } from "@/lib/accountSecurity";
import Link from "next/link";
import { Callout } from "@/components/ui/display";
import { AccountCard } from "@/components/account/AccountCard";

export const metadata: Metadata = { title: "Account security" };

export default async function AccountSecurityPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const { link } = await searchParams;
  const passkeys = await loadPasskeysView();
  const { hasPassword, superAdmin, authenticatorRequired, isStaff, user, activity, sessions, linked, linkable, recoveryCodesLeft } = await loadAccountSecurityView();
  return (
    <div className="flex flex-col gap-6">
      {authenticatorRequired ? (
        <Callout tone="warning" title="Set up an authenticator app to open the dashboard">
          You&apos;re on an organisation&apos;s team, so your account needs an authenticator app (such as Google Authenticator, Microsoft Authenticator or 1Password). Turn on two-step sign-in below. Members&apos; accounts don&apos;t need one.
        </Callout>
      ) : isStaff && user.mfaEnabledAt ? (
        <Callout tone="success">Your authenticator app is on. <Link href="/dashboard" className="font-semibold underline underline-offset-4">Go to the dashboard</Link>.</Callout>
      ) : null}
      {superAdmin ? (
        <AccountCard id="account-password" title="Password" description="This is a super-admin account, so its password is set on the server, never here or by email.">
          <p className="text-body-ui text-ink-secondary">On the server, run <code className="code-text rounded-sm bg-subtle px-1.5 py-0.5 text-sm text-ink [overflow-wrap:anywhere]">scripts/spaceworks-compose.sh bundled run --rm ops admin set-password --email {"<your email>"}</code>.</p>
        </AccountCard>
      ) : <AccountPasswordForm hasPassword={hasPassword} />}
      <AccountSecurityClient mfaEnabled={Boolean(user.mfaEnabledAt)} />
      {user.mfaEnabledAt ? <RecoveryCodesCard remaining={recoveryCodesLeft} /> : null}
      <SignInMethodsCard hasPassword={hasPassword} linked={linked} linkable={linkable} linkNotice={link} />
      <PasskeysCard offered={passkeys.offered} passkeys={passkeys.passkeys} />
      <PhoneCard />
      <SignedInDevicesCard devices={sessions} />
      <SecurityActivityCard
        items={activity.map((event) => ({ id: event.id, label: securityActivityLabel(event.action), at: event.createdAt.toISOString() }))}
      />
      <SignOutEverywhereCard />
    </div>
  );
}
