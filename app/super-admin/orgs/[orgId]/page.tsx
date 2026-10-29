import { requireSuperAdmin } from "@/lib/permissions";
import { loadSuperAdminOrgDetailView } from "@/lib/views/app__super-admin__orgs__orgId__page";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AdminPanel, LinkRow, MetricRows, NameCell } from "@/components/super-admin/AdminPanel";
import { AuditTable } from "@/components/super-admin/AuditTable";
import { OrganisationStatusChip } from "@/components/org/OrganisationStatusChip";
import { ReviewHistory } from "@/components/super-admin/ReviewHistory";
import { formatBytes } from "@/lib/superAdminInsights";
import { indianStateName } from "@/lib/indianStates";
import { OrganisationDecisionPanel } from "@/components/super-admin/OrganisationDecisionPanel";
import { OrganisationLimitsForm } from "@/components/super-admin/OrganisationLimitsForm";
import { OwnerInviteResend } from "@/components/super-admin/OwnerInviteResend";
import { OrganisationVisibilityToggle } from "@/components/super-admin/OrganisationVisibilityToggle";
import { Chip, OrgLogo, StatTile } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

type Props = {
  params: Promise<{ orgId: string }>;
};

export default async function SuperAdminOrgDetailPage({ params }: Props) {
  await requireSuperAdmin();
  const { org, reviews, members, invites, assetStats, auditEvents, now } = await loadSuperAdminOrgDetailView({ params });
  const address = [org.addressLine, org.city, indianStateName(org.stateCode), org.postalCode].filter(Boolean).join(", ");
  const hasOwner = members.some((m) => m.orgRole.isOwner);
  const ownerInviteEmail = invites.find((invite) => invite.orgRole.isOwner && invite.email)?.email ?? "";
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Link href="/super-admin/orgs" className="inline-flex w-fit items-center gap-1 text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline">
          <ArrowLeft aria-hidden className="size-4" />
          Organisations
        </Link>
        <div className="flex items-center gap-4">
          <OrgLogo name={org.name} src={org.logoUrl} size="lg" />
          <div className="min-w-0">
            <h1 className="break-words text-h1 text-ink">{org.name}</h1>
            <p className="mt-0.5 text-sm text-ink-muted">
              {org.source === "SUPERADMIN" ? "Added by a platform admin" : "Applied"} on {org.createdAt.toLocaleDateString("en-GB")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <OrganisationStatusChip status={org.status} size="md" />
          <Chip tone="outline" className="tabular-nums">{`/o/${org.slug}`}</Chip>
          <Chip tone="outline">{`${org._count.teamMembers} on the team`}</Chip>
          {org.visibility === "PUBLIC" ? <Chip tone="outline">Listed publicly</Chip> : null}
        </div>
        {/* Platform access: a super admin opens any organisation's dashboard as its owner (audited). */}
        <LinkRow links={[
          ...(org.status === "ACTIVE" ? [{ href: `/o/${org.slug}`, label: "Public page" }] : []),
          { href: `/dashboard/${org.slug}`, label: "Organisation dashboard" },
          { href: `/super-admin/orgs/${org.id}/analytics`, label: "Analytics" },
        ]} />
      </header>

      <OrganisationDecisionPanel organisationId={org.id} status={org.status} />
      {!hasOwner && org.status !== "REJECTED" ? <OwnerInviteResend organisationId={org.id} defaultEmail={ownerInviteEmail} /> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AdminPanel title="Application details">
          <MetricRows
            rows={[
              { label: "Kind", value: org.kind || "—" },
              { label: "Contact email", value: org.contactEmail ?? "—" },
              { label: "Contact phone", value: org.contactPhone ?? "—" },
              { label: "Website", value: org.website ?? "—" },
              { label: "Address", value: address || "—" },
            ]}
          />
          <p className="mt-4 whitespace-pre-wrap text-body-ui text-ink-secondary">{org.description || "No description given."}</p>
        </AdminPanel>
        <AdminPanel title="Review history" description="Every decision, newest first.">
          <ReviewHistory reviews={reviews} />
        </AdminPanel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid grid-cols-2 content-start gap-3">
          <StatTile className="rounded-xl" label="Team" value={org._count.teamMembers.toLocaleString("en-IN")} />
          <StatTile className="rounded-xl" label="Stored files" value={assetStats._count._all.toLocaleString("en-IN")} hint={formatBytes(assetStats._sum.byteSize == null ? 0 : Number(assetStats._sum.byteSize))} />
        </div>
        <div className="flex flex-col gap-6">
          <OrganisationVisibilityToggle organisationId={org.id} visibility={org.visibility} active={org.status === "ACTIVE"} />
          <OrganisationLimitsForm organisationId={org.id} memberLimit={org.memberLimit} managerLimit={org.managerLimit} />
        </div>
      </div>

      <AdminPanel title="Team">
        <Table label="Team">
          <THead>
            <tr>
              <TH>Person</TH>
              <TH>Role</TH>
              <TH>Joined</TH>
            </tr>
          </THead>
          <TBody>
            {members.length === 0 ? (
              <tr><TD colSpan={3} className="py-6 text-center text-ink-muted">No one on the team yet.</TD></tr>
            ) : (
              members.map((m) => (
                <TR key={m.id}>
                  <TD><NameCell href={`/super-admin/users/${m.user.id}`} name={m.user.name ?? m.user.email ?? "—"} sub={m.user.email ?? undefined} /></TD>
                  <TD><Chip size="sm" tone={m.orgRole.isOwner ? "ink" : "neutral"}>{m.orgRole.name}</Chip></TD>
                  <TD className="whitespace-nowrap text-ink-secondary">{m.createdAt.toLocaleDateString("en-GB")}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </AdminPanel>

      <AdminPanel title="Team invites">
        <Table label="Team invites">
          <THead>
            <tr>
              <TH>Role</TH>
              <TH>For</TH>
              <TH>State</TH>
              <TH>Created</TH>
            </tr>
          </THead>
          <TBody>
            {invites.length === 0 ? (
              <tr><TD colSpan={4} className="py-6 text-center text-ink-muted">No invites.</TD></tr>
            ) : (
              invites.map((invite) => (
                <TR key={invite.id}>
                  <TD>{invite.orgRole.name}</TD>
                  <TD className="text-sm">{invite.email ?? "Anyone with the link"}</TD>
                  <TD>{invite.usedAt ? `Used by ${invite.usedBy?.email ?? "someone"}` : invite.expiresAt && invite.expiresAt <= now ? "Expired" : "Open"}</TD>
                  <TD className="whitespace-nowrap text-ink-secondary">{invite.createdAt.toLocaleDateString("en-GB")}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </AdminPanel>

      <AdminPanel title="Recent audit log">
        <AuditTable events={auditEvents} label="Recent audit log" hideOrganisation />
      </AdminPanel>
    </div>
  );
}
