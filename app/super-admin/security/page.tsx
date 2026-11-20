import { requireSuperAdmin } from "@/lib/permissions";
import { loadSuperAdminSecurityView } from "@/lib/views/app__super-admin__security__page";
import { formatShare } from "@/lib/superAdminInsights";
import { AdminPanel, MetricRows, NameCell } from "@/components/super-admin/AdminPanel";
import { AuditTable } from "@/components/super-admin/AuditTable";
import { BlockedAddresses } from "@/components/super-admin/BlockedAddresses";
import { Chip, EmptyState, PageHeader, StatTile } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatCount, formatUtcStamp } from "@/lib/format/datetime";

const ACTION_WINDOW_DAYS = 7;

export default async function SuperAdminSecurityPage() {
  await requireSuperAdmin();
  const { mfaUsers, users, managersWithoutMfa, managers, unverifiedUsers, passwordUsers, providerGroups, activeSessions, sortedActions, recentSecurityEvents, platformAdmins, blockedAddresses } = await loadSuperAdminSecurityView();
  const when = (iso: string | null) => (iso ? formatUtcStamp(iso) : "Unknown");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Security" description="Account protection, sign-in methods, platform admins and sensitive activity across the instance." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Users with MFA" value={formatShare(mfaUsers, users)} hint={`${formatCount(mfaUsers)} of ${formatCount(users)} users`} progress={{ value: mfaUsers, max: Math.max(users, 1), tone: "success" }} />
        <StatTile label="Staff without an authenticator" value={formatCount(managersWithoutMfa)} hint={`of ${formatCount(managers)} staff; locked out of dashboards until they add one`} tone={managersWithoutMfa > 0 ? "attention" : "default"} />
        <StatTile label="Unverified email" value={formatCount(unverifiedUsers)} hint={`${formatShare(unverifiedUsers, users)} of users`} />
        <StatTile label="Blocked addresses" value={formatCount(blockedAddresses.length)} hint="After repeated failed sign-ins" tone={blockedAddresses.length > 0 ? "attention" : "default"} />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <AdminPanel title="Sign-in methods">
          <MetricRows
            rows={[
              { label: "Users with a password", value: formatCount(passwordUsers) },
              ...providerGroups.map((group) => ({ label: `Linked ${group.provider} accounts`, value: formatCount(group._count._all) })),
              { label: "Unexpired database sessions", value: formatCount(activeSessions) },
            ]}
          />
        </AdminPanel>
        <AdminPanel title={`Sensitive actions (last ${ACTION_WINDOW_DAYS} days)`} description="Access changes, exports, and credential activity from the audit log.">
          {sortedActions.length === 0 ? (
            <EmptyState mood="sleepy">No sensitive actions recorded this week.</EmptyState>
          ) : (
            <MetricRows rows={sortedActions.map((row) => ({ label: <span className="tabular-nums text-sm">{row.action}</span>, value: formatCount(row._count._all) }))} />
          )}
        </AdminPanel>
      </div>

      <AdminPanel title="Blocked addresses" description="Twenty failed sign-ins in 15 minutes block an address from signing in, signing up and resetting passwords for an hour (a day if it happens again within a week).">
        <BlockedAddresses rows={blockedAddresses.map((row) => ({ ip: row.ip, blocked: when(row.blockedAt), until: when(row.expiresAt) }))} />
      </AdminPanel>

      <AdminPanel title="Recent sensitive activity" description="Latest 25 matching audit events. Metadata is redacted; use the Audit log page to search further.">
        <AuditTable events={recentSecurityEvents} label="Recent sensitive activity" empty="No sensitive activity recorded." />
      </AdminPanel>

      <AdminPanel title="Super admins" description="Super admins sign in with their email and password only. They are added, removed and given passwords on the server: bash scripts/admin.sh create, revoke or set-password.">
        {platformAdmins.length === 0 ? (
          <EmptyState mood="sleepy">No super admins yet. Create one on the server with bash scripts/admin.sh create.</EmptyState>
        ) : (
          <Table label="Platform admins">
            <THead>
              <tr>
                <TH>Person</TH>
                <TH>Email</TH>
              </tr>
            </THead>
            <TBody>
              {platformAdmins.map((admin) => (
                <TR key={admin.id}>
                  <TD><NameCell href={`/super-admin/users/${admin.id}`} name={admin.name ?? admin.email ?? "Unnamed"} /></TD>
                  <TD className="text-ink-secondary">{admin.email}{admin.emailVerified ? null : <Chip size="sm" tone="warning" className="ml-2">Unverified</Chip>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </AdminPanel>
    </div>
  );
}
