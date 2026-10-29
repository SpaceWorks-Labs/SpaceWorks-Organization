import { requireSuperAdmin } from "@/lib/permissions";
import { loadSuperAdminUserDetailView } from "@/lib/views/app__super-admin__users__userId__page";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AdminPanel, MetricRows, NameCell } from "@/components/super-admin/AdminPanel";
import { AuditTable } from "@/components/super-admin/AuditTable";
import { Avatar, Chip, EmptyState } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

type Props = {
  params: Promise<{ userId: string; }>;
};

/** Support lookup for one person: account posture, organisation teams and their audit trail. */
export default async function SuperAdminUserDetailPage({ params }: Props) {
  await requireSuperAdmin();
  const { user, hasPassword, accounts, activeSessions, memberships, auditEvents, displayName } = await loadSuperAdminUserDetailView({ params });
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Link href="/super-admin/users" className="inline-flex w-fit items-center gap-1 text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline">
          <ArrowLeft aria-hidden className="size-4" />
          Users
        </Link>
        <div className="flex items-center gap-4">
          <Avatar name={displayName} src={user.profileImageUrl ?? user.image} size="lg" />
          <div className="min-w-0">
            <h1 className="break-words text-h1 text-ink">{displayName}</h1>
            <p className="mt-0.5 text-sm text-ink-muted [overflow-wrap:anywhere]">{user.email ?? "No email"} · Joined {user.createdAt.toLocaleString()}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip tone={user.emailVerified ? "success" : "warning"}>{user.emailVerified ? "Email verified" : "Email not verified"}</Chip>
          <Chip tone={user.mfaEnabledAt ? "success" : "neutral"}>{user.mfaEnabledAt ? `MFA since ${user.mfaEnabledAt.toLocaleDateString()}` : "MFA off"}</Chip>
          {user.isSuperAdmin ? <Chip tone="ink">Platform admin</Chip> : null}
          <Chip tone="outline">{hasPassword > 0 ? "Password set" : "No password"}</Chip>
          {accounts.map((account) => <Chip key={account.id} tone="outline">{`${account.provider} (${account.type})`}</Chip>)}
          <Chip tone="outline" className="tabular-nums">{user.id}</Chip>
        </div>
      </header>

      {user.isSuperAdmin ? <p className="text-caption text-ink-muted">Super admin. Super admins are added, removed and given passwords only on the server: <code>bash scripts/admin.sh</code>.</p> : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <AdminPanel title="Summary">
          <MetricRows
            rows={[
              { label: "Organisation teams", value: user._count.teamMembers.toLocaleString("en-IN") },
              { label: "Sessions (unexpired / total)", value: `${activeSessions} / ${user._count.sessions}` },
            ]}
          />
        </AdminPanel>

        <AdminPanel title="Organisations">
          {memberships.length === 0 ? (
            <EmptyState mood="sleepy">Not on any organisation&rsquo;s team.</EmptyState>
          ) : (
            <Table label="Organisation teams">
              <THead>
                <tr>
                  <TH>Organisation</TH>
                  <TH>Role</TH>
                  <TH>Joined</TH>
                </tr>
              </THead>
              <TBody>
                {memberships.map((membership) => (
                  <TR key={membership.id}>
                    <TD><NameCell href={`/super-admin/orgs/${membership.organisation.id}`} name={membership.organisation.name} sub={`/o/${membership.organisation.slug}`} /></TD>
                    <TD><Chip size="sm" tone={membership.orgRole.isOwner ? "ink" : "neutral"}>{membership.orgRole.name}</Chip></TD>
                    <TD className="whitespace-nowrap text-ink-secondary">{membership.createdAt.toLocaleDateString()}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </AdminPanel>
      </div>

      <AdminPanel title="Recent actions by this user" description="Latest 20 audit events where this user was the actor.">
        <AuditTable events={auditEvents} label="Recent actions by this user" empty="No audit events for this user." />
      </AdminPanel>
    </div>
  );
}
