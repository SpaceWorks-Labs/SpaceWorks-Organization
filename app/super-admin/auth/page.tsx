import { requireSuperAdmin } from "@/lib/permissions";
import { loadSuperAdminAuthView } from "@/lib/views/app__super-admin__auth__page";
import { AccountCreationControl } from "@/components/super-admin/AccountCreationControl";
import { LoginMethodsForm } from "@/components/super-admin/LoginMethodsForm";
import { SingleSignOnPanels } from "@/components/super-admin/SingleSignOnPanels";
import { InstanceSmsPanel } from "@/components/super-admin/InstanceSmsPanel";
import { AdminPanel } from "@/components/super-admin/AdminPanel";
import { PageHeader, StatTile } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export default async function SuperAdminAuthPage() {
  await requireSuperAdmin();
  const { oidcProviders, samlProviders, loginRows, loginSwitches, loginSetByServer, accountsCount, sessionsCount, tokensCount, accountCreationEnabled, accounts, sessions, tokens } = await loadSuperAdminAuthView();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Auth" description="Sign-in methods, single sign-on, phone codes, account creation, and recent accounts, sessions and verification tokens." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile className="rounded-xl" label="Accounts" value={accountsCount.toLocaleString()} />
        <StatTile className="rounded-xl" label="Sessions" value={sessionsCount.toLocaleString()} />
        <StatTile className="rounded-xl" label="Verification tokens" value={tokensCount.toLocaleString()} />
      </div>

      <AdminPanel title="Sign-in methods" description="A method works when its switch is on and it is configured. Switching one off keeps its credentials.">
        <LoginMethodsForm rows={loginRows} initial={loginSwitches} setByServer={loginSetByServer} />
      </AdminPanel>

      <SingleSignOnPanels oidc={oidcProviders} saml={samlProviders} />

      <InstanceSmsPanel />

      <AccountCreationControl initialEnabled={accountCreationEnabled} />

      <AdminPanel title="Recent accounts">
        <Table label="Recent accounts">
          <THead>
            <tr>
              <TH>Provider</TH>
              <TH>Type</TH>
              <TH>Provider account</TH>
              <TH>User</TH>
            </tr>
          </THead>
          <TBody>
            {accounts.map((a) => (
              <TR key={a.id}>
                <TD>{a.provider}</TD>
                <TD>{a.type}</TD>
                <TD className="tabular-nums text-sm [overflow-wrap:anywhere]">{a.providerAccountId}</TD>
                <TD className="tabular-nums text-sm">{a.user.email ?? a.user.id}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </AdminPanel>

      <AdminPanel title="Recent sessions">
        <Table label="Recent sessions">
          <THead>
            <tr>
              <TH>User</TH>
              <TH>Expires</TH>
              <TH>Session id</TH>
            </tr>
          </THead>
          <TBody>
            {sessions.map((s) => (
              <TR key={s.id}>
                <TD className="tabular-nums text-sm">{s.user.email ?? s.user.id}</TD>
                <TD className="whitespace-nowrap text-ink-secondary">{s.expires.toLocaleString()}</TD>
                <TD className="tabular-nums text-sm [overflow-wrap:anywhere]">{s.id}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </AdminPanel>

      <AdminPanel title="Recent verification tokens" description="Only token type and expiry are shown. Identifiers and token values are never exposed.">
        <Table label="Recent verification tokens">
          <THead>
            <tr>
              <TH>Type</TH>
              <TH>Expires</TH>
            </tr>
          </THead>
          <TBody>
            {tokens.map((t) => (
              <TR key={`${t.identifier}:${t.expires.toISOString()}`}>
                <TD>{t.identifier.startsWith("mfa:") ? "MFA enrollment" : t.identifier.startsWith("reset:") ? "Password reset" : "Other verification"}</TD>
                <TD className="whitespace-nowrap text-ink-secondary">{t.expires.toLocaleString()}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </AdminPanel>
    </div>
  );
}
