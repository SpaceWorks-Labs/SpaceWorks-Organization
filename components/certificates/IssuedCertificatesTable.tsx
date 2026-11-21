import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { Chip, EmptyState } from "@/components/ui/display";
import { Dropdown } from "@/components/ui/select";
import { SearchField } from "@/components/ui/search-field";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CERTIFICATE_STATE_LABELS, type CertificateState } from "@/lib/certificates/core";
import { formatIssuedDate } from "./format";

type Row = { id: string; number: string; title: string; memberId: string; memberName: string; designName: string; issuedAt: string; state: CertificateState };
type Filters = { design: string | null; status: "all" | "valid" | "revoked"; q: string };

/**
 * Issued certificates with a search (member name or certificate number), a design and a status filter, 25 a page.
 * The filters are a plain GET form, so they work before scripts load and every view has its own address.
 */
export function IssuedCertificatesTable({ base, designs, filters, certificates, canIssue, timeZone }: {
  base: string;
  timeZone?: string;
  designs: Array<{ id: string; name: string }>;
  filters: Filters;
  certificates: { rows: Row[]; total: number; page: number; pages: number };
  canIssue: boolean;
}) {
  const filtered = Boolean(filters.design || filters.status !== "all" || filters.q);
  const query = (patch: Record<string, string | number>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ design: filters.design ?? "", status: filters.status === "all" ? "" : filters.status, q: filters.q, ...patch })) if (value) next.set(key, String(value));
    const text = next.toString();
    return text ? `${base}?${text}` : base;
  };
  return (
    <div className="flex flex-col gap-4">
      <form role="search" action={base} className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor="certificate-search" className="text-label text-ink">Search</label>
          <SearchField id="certificate-search" name="q" defaultValue={filters.q} placeholder="Member name or certificate number" />
        </div>
        <div className="flex flex-col gap-1.5 md:w-56">
          <label htmlFor="certificate-design" className="text-label text-ink">Design</label>
          <Dropdown id="certificate-design" name="design" defaultValue={filters.design ?? ""}>
            <option value="">Every design</option>
            {designs.map((design) => <option key={design.id} value={design.id}>{design.name}</option>)}
          </Dropdown>
        </div>
        <div className="flex flex-col gap-1.5 md:w-44">
          <label htmlFor="certificate-status" className="text-label text-ink">Status</label>
          <Dropdown id="certificate-status" name="status" defaultValue={filters.status}>
            <option value="all">Any status</option>
            <option value="valid">Valid</option>
            <option value="revoked">Revoked</option>
          </Dropdown>
        </div>
        <button type="submit" className={buttonClasses({ variant: "secondary" })}>Search</button>
      </form>

      {certificates.rows.length === 0 ? (
        filtered ? (
          <EmptyState mood="sleepy" title="No certificates match these filters" action={<Link href={base} scroll={false} className={buttonClasses({ variant: "secondary" })}>Clear filters</Link>}>
            Try another search, design or status, or clear them to see every certificate.
          </EmptyState>
        ) : (
          <EmptyState mood="waiting" title="No certificates issued yet" action={canIssue ? <Link href={`${base}/issue`} className={buttonClasses({ variant: "secondary" })}>Issue certificates</Link> : undefined}>
            {canIssue ? "Issue certificates from an approved design to chosen members, a plan or a smart group." : "Certificates show here once they are issued from an approved design."}
          </EmptyState>
        )
      ) : (
        <Table label="Issued certificates">
          <THead>
            <tr>
              <TH>Member</TH>
              <TH>Certificate</TH>
              <TH>Number</TH>
              <TH>Issued</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {certificates.rows.map((row) => (
              <TR key={row.id}>
                <TD>
                  <Link href={`${base}/${row.id}`} className="font-semibold text-ink underline-offset-4 hover:underline">{row.memberName}</Link>
                </TD>
                <TD className="text-ink-secondary">
                  {row.title}
                  <span className="block text-caption text-ink-muted">{row.designName}</span>
                </TD>
                <TD className="code-text whitespace-nowrap text-ink-secondary">{row.number}</TD>
                <TD className="whitespace-nowrap text-ink-secondary">{formatIssuedDate(row.issuedAt, timeZone)}</TD>
                <TD><Chip size="sm" tone={row.state === "valid" ? "success" : "danger"}>{CERTIFICATE_STATE_LABELS[row.state]}</Chip></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {certificates.pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ink-muted">Page {certificates.page} of {certificates.pages} · {certificates.total.toLocaleString("en-IN")} certificates</span>
          <span className="flex gap-2">
            {certificates.page > 1 ? <Link href={query({ page: certificates.page - 1 })} className={buttonClasses({ variant: "secondary", size: "sm" })}>Previous</Link> : null}
            {certificates.page < certificates.pages ? <Link href={query({ page: certificates.page + 1 })} className={buttonClasses({ variant: "secondary", size: "sm" })}>Next</Link> : null}
          </span>
        </nav>
      ) : null}
    </div>
  );
}
