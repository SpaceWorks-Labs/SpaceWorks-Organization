import { ShieldAlert, ShieldCheck, MailCheck, MailWarning } from "lucide-react";
import { Avatar, Chip } from "@/components/ui/display";
import { AccountNavTabs } from "@/components/account/AccountNavTabs";

type AccountHeaderData = {
  name: string | null;
  email: string | null;
  image: string | null;
  emailVerified: boolean;
  mfaEnabled: boolean;
  memberSinceLabel: string;
};

/** Account area frame: a summary header card, the account tabs, then the page. */
export function AccountSettingsLayout({ account, children }: { account: AccountHeaderData; children: React.ReactNode }) {
  const displayName = account.name?.trim() || account.email || "Your account";
  return (
    <div className="flex w-full flex-col gap-6">
      <header className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-6">
        <Avatar name={displayName} src={account.image} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-sm text-ink-muted">Account</p>
          <h1 className="break-words text-h1 text-ink">{displayName}</h1>
          {account.email && account.email !== displayName ? (
            <p className="truncate text-body-ui text-ink-secondary">{account.email}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {account.emailVerified ? (
              <Chip size="sm" tone="success" icon={<MailCheck />}>Email verified</Chip>
            ) : (
              <Chip size="sm" tone="warning" icon={<MailWarning />}>Email not verified</Chip>
            )}
            {account.mfaEnabled ? (
              <Chip size="sm" tone="success" icon={<ShieldCheck />}>Two-step on</Chip>
            ) : (
              <Chip size="sm" tone="neutral" icon={<ShieldAlert />}>Two-step off</Chip>
            )}
            <span className="text-caption text-ink-muted">Member since {account.memberSinceLabel}</span>
          </div>
        </div>
      </header>
      <AccountNavTabs />
      {children}
    </div>
  );
}
