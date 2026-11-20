import Link from "next/link";
import { Plus } from "lucide-react";
import { requireSuperAdmin } from "@/lib/permissions";
import { loadSuperAdminOrgsView } from "@/lib/views/app__super-admin__orgs__page";
import { AdminPager, AdminSearchForm, NameCell } from "@/components/super-admin/AdminPanel";
import { ORGANISATION_STATUS_LABELS, OrganisationStatusChip } from "@/components/org/OrganisationStatusChip";
import { buttonClasses } from "@/components/ui/button";
import { OrganisationApplicationsControl } from "@/components/super-admin/OrganisationApplicationsControl";
import { PageHeader } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";

type Props = {
  searchParams: Promise<{ q?: string; page?: string; status?: string }>;
};

export default async function SuperAdminOrgsPage({ searchParams }: Props) {
  await requireSuperAdmin();
  const { applicationsOpen, q, status, page, orgs, total, counts } = await loadSuperAdminOrgsView({ searchParams });
  const chip = (href: string, label: string, count: number, active: boolean) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-control border px-3.5 text-sm transition-colors",
        active ? "border-primary bg-primary font-semibold text-on-primary" : "border-line bg-panel text-ink hover:bg-muted",
      )}
    >
      {label} <span className="tabular-nums">{count}</span>
    </Link>
  );
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Organisations"
        description="Every organisation on this platform. Applications wait under review until you decide."
        actions={
          <Link href="/super-admin/orgs/new" className={buttonClasses({ variant: "primary" })}>
            <Plus aria-hidden className="size-4" />
            Add organisation
          </Link>
        }
      />
      <OrganisationApplicationsControl initialEnabled={applicationsOpen} />
      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {chip("/super-admin/orgs", "All", total, status === null)}
        {counts.filter((row) => row.count > 0 || row.status === "PENDING_REVIEW").map((row) =>
          chip(`/super-admin/orgs?status=${row.status}`, ORGANISATION_STATUS_LABELS[row.status], row.count, status === row.status),
        )}
      </nav>
      <AdminSearchForm action="/super-admin/orgs" label="Search by name, address or contact email" defaultValue={q}>
        {status ? <input type="hidden" name="status" value={status} /> : null}
      </AdminSearchForm>

      <Table label="Organisations">
        <THead>
          <tr>
            <TH>Organisation</TH>
            <TH>Status</TH>
            <TH className="text-right">Team</TH>
            <TH>{status === "PENDING_REVIEW" ? "Waiting since" : "Created"}</TH>
          </tr>
        </THead>
        <TBody>
          {orgs.length === 0 ? (
            <tr><TD colSpan={4} className="py-8 text-center text-ink-muted">{status ? "No organisations with this status." : "No organisations yet."}</TD></tr>
          ) : (
            orgs.map((o) => (
              <TR key={o.id}>
                <TD><NameCell href={`/super-admin/orgs/${o.id}`} name={o.name} sub={[`/o/${o.slug}`, o.kind, o.city].filter(Boolean).join(" · ")} /></TD>
                <TD><OrganisationStatusChip status={o.status} /></TD>
                <TD className="text-right tabular-nums">{o._count.teamMembers}</TD>
                <TD className="whitespace-nowrap text-ink-secondary">{(status === "PENDING_REVIEW" ? o.updatedAt : o.createdAt).toLocaleDateString("en-GB")}</TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>

      <AdminPager basePath="/super-admin/orgs" query={q} page={page} extra={status ? `&status=${status}` : ""} />
    </div>
  );
}
