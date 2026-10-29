import { redactSensitiveText } from "@/lib/redactSensitiveText";
import { NameCell } from "@/components/super-admin/AdminPanel";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

type AuditRow = {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  createdAt: Date;
  actor: { name: string | null; email: string | null } | null;
  organisation: { id: string; name: string; slug: string } | null;
};

/** Selection that matches {@link AuditRow}; never widen it to secrets or raw request data. */
export const auditRowSelect = {
  id: true,
  action: true,
  targetType: true,
  targetId: true,
  metadata: true,
  createdAt: true,
  actor: { select: { name: true, email: true } },
  organisation: { select: { id: true, name: true, slug: true } },
} as const;

function metadataSummary(value: unknown) {
  if (value == null) return "—";
  return redactSensitiveText(JSON.stringify(value)).slice(0, 500);
}

/** Audit events with redacted metadata, shared by the audit, security, user, and organisation pages. */
export function AuditTable({ events, label, empty = "No audit events found.", hideOrganisation = false }: { events: AuditRow[]; label: string; empty?: string; hideOrganisation?: boolean }) {
  const columns = hideOrganisation ? 5 : 6;
  return (
    <Table label={label} className="min-w-[900px]">
      <THead>
        <tr>
          <TH>When</TH>
          <TH>Action</TH>
          <TH>Actor</TH>
          {hideOrganisation ? null : <TH>Organisation</TH>}
          <TH>Target</TH>
          <TH>Metadata</TH>
        </tr>
      </THead>
      <TBody>
        {events.length === 0 ? (
          <tr><TD colSpan={columns} className="py-8 text-center text-ink-muted">{empty}</TD></tr>
        ) : events.map((event) => (
          <TR key={event.id}>
            <TD className="align-top whitespace-nowrap text-ink-secondary">{event.createdAt.toLocaleString()}</TD>
            <TD className="align-top font-medium tabular-nums text-sm [overflow-wrap:anywhere]">{event.action}</TD>
            <TD className="align-top"><NameCell name={event.actor?.name ?? event.actor?.email ?? "System"} sub={event.actor?.email && event.actor.name ? event.actor.email : undefined} /></TD>
            {hideOrganisation ? null : <TD className="align-top">{event.organisation ? <NameCell href={`/super-admin/orgs/${event.organisation.id}`} name={event.organisation.name} sub={`/${event.organisation.slug}`} /> : "—"}</TD>}
            <TD className="align-top font-medium tabular-nums text-sm [overflow-wrap:anywhere]">{event.targetType ? `${event.targetType}${event.targetId ? ` · ${event.targetId}` : ""}` : "—"}</TD>
            <TD className="max-w-[280px] align-top font-medium tabular-nums text-xs text-ink-secondary [overflow-wrap:anywhere]">{metadataSummary(event.metadata)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
