import { requireSuperAdmin } from "@/lib/permissions";
import { loadSuperAdminUsersView } from "@/lib/views/app__super-admin__users__page";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { cn } from "@/lib/cn";
import { AdminPager, AdminSearchForm, NameCell } from "@/components/super-admin/AdminPanel";
import { Chip, PageHeader } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

type Props = {
  searchParams: Promise<{ q?: string; page?: string; filter?: string; }>;
};

const filters = {
  all: { label: "All", where: {} },
  unverified: { label: "Unverified email", where: { emailVerified: null } },
  "no-mfa": { label: "Without MFA", where: { mfaEnabledAt: null } },
  mfa: { label: "With MFA", where: { mfaEnabledAt: { not: null } } },
} satisfies Record<string, { label: string; where: Prisma.UserWhereInput; }>;

type FilterKey = keyof typeof filters;

export default async function SuperAdminUsersPage({ searchParams }: Props) {
  await requireSuperAdmin();
  const { q, filter, users, page } = await loadSuperAdminUsersView({ searchParams });

  const filterHref = (key: FilterKey) => `/super-admin/users?q=${encodeURIComponent(q)}${key === "all" ? "" : `&filter=${key}`}`;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Users" description="Every account on this platform, with verification, MFA, organisation teams, sign-in accounts and sessions." />
      <AdminSearchForm action="/super-admin/users" label="Search by name or email" defaultValue={q}>
        {filter === "all" ? null : <input type="hidden" name="filter" value={filter} />}
      </AdminSearchForm>

      <nav aria-label="Filter users" className="flex flex-wrap gap-1.5">
        {(Object.keys(filters) as FilterKey[]).map((key) => (
          <Link
            key={key}
            href={filterHref(key)}
            aria-current={key === filter ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-control border border-line px-3 text-sm text-ink-secondary transition-colors hover:bg-muted hover:text-ink",
              key === filter && "border-transparent bg-primary font-semibold text-on-primary hover:bg-primary hover:text-on-primary",
            )}
          >
            {filters[key].label}
          </Link>
        ))}
      </nav>

      <Table label="Users">
        <THead>
          <tr>
            <TH>User</TH>
            <TH>Email</TH>
            <TH>Verified</TH>
            <TH>MFA</TH>
            <TH className="text-right">Orgs</TH>
            <TH className="text-right">Accounts</TH>
            <TH className="text-right">Sessions</TH>
            <TH>Created</TH>
          </tr>
        </THead>
        <TBody>
          {users.length === 0 ? (
            <tr><TD colSpan={8} className="py-8 text-center text-ink-muted">No users.</TD></tr>
          ) : (
            users.map((u) => (
              <TR key={u.id}>
                <TD><NameCell href={`/super-admin/users/${u.id}`} name={u.name ?? "—"} sub={u.isSuperAdmin ? "Platform admin" : u.id} /></TD>
                <TD className="tabular-nums text-sm">{u.email ?? "—"}</TD>
                <TD>{u.emailVerified ? <Chip size="sm" tone="success">Yes</Chip> : <Chip size="sm" tone="warning">No</Chip>}</TD>
                <TD>{u.mfaEnabledAt ? <Chip size="sm" tone="success">On</Chip> : <Chip size="sm" tone="neutral">Off</Chip>}</TD>
                <TD className="text-right tabular-nums">{u._count.teamMembers}</TD>
                <TD className="text-right tabular-nums">{u._count.accounts}</TD>
                <TD className="text-right tabular-nums">{u._count.sessions}</TD>
                <TD className="whitespace-nowrap text-ink-secondary">{u.createdAt.toLocaleString()}</TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>

      <AdminPager basePath="/super-admin/users" query={q} page={page} extra={filter === "all" ? "" : `&filter=${filter}`} />
    </div>
  );
}
