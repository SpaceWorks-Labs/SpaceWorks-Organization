import { requireSuperAdmin } from "@/lib/permissions";
import { loadSuperAdminStorageView } from "@/lib/views/app__super-admin__storage__page";
import { AdminPanel, NameCell } from "@/components/super-admin/AdminPanel";
import { EmptyState, PageHeader, StatTile } from "@/components/ui/display";
import { formatBytes } from "@/lib/superAdminInsights";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export default async function SuperAdminStoragePage() {
  await requireSuperAdmin();
  const { dbSizeBytes, assetSummary, sortedTypes, recentAssets, tableSizes, perOrgCounts, assetTotals } = await loadSuperAdminStorageView();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Storage" description="Database size, largest tables, and each organisation's footprint." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile
          className="rounded-xl"
          label="Database size"
          value={dbSizeBytes == null ? "—" : formatBytes(dbSizeBytes)}
          hint={dbSizeBytes == null ? "Unavailable (DB functions may be restricted)." : undefined}
        />
        <StatTile label="Stored files" value={assetSummary._count._all.toLocaleString()} />
        <StatTile label="Stored file size" value={formatBytes(assetSummary._sum.byteSize == null ? 0 : Number(assetSummary._sum.byteSize))} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AdminPanel title="Files by provider and type">
          {sortedTypes.length === 0 ? (
            <EmptyState mood="sleepy">No tracked files.</EmptyState>
          ) : (
            <Table label="Files by provider and type">
              <THead>
                <tr>
                  <TH>Provider</TH>
                  <TH>Type</TH>
                  <TH className="text-right">Files</TH>
                  <TH className="text-right">Size</TH>
                </tr>
              </THead>
              <TBody>
                {sortedTypes.map((row) => (
                  <TR key={`${row.provider}:${row.contentType ?? ""}`}>
                    <TD className="tabular-nums text-sm">{row.provider}</TD>
                    <TD className="tabular-nums text-sm">{row.contentType ?? "unknown"}</TD>
                    <TD className="text-right tabular-nums">{row._count._all.toLocaleString()}</TD>
                    <TD className="text-right tabular-nums">{formatBytes(row._sum.byteSize == null ? 0 : Number(row._sum.byteSize))}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </AdminPanel>

        <AdminPanel title="Recent uploads" description="Latest 15 tracked files. Storage keys and URLs are not shown.">
          {recentAssets.length === 0 ? (
            <EmptyState mood="sleepy">No tracked files.</EmptyState>
          ) : (
            <Table label="Recent uploads">
              <THead>
                <tr>
                  <TH>Organisation</TH>
                  <TH>Type</TH>
                  <TH className="text-right">Size</TH>
                  <TH>Uploaded</TH>
                </tr>
              </THead>
              <TBody>
                {recentAssets.map((asset) => (
                  <TR key={asset.id}>
                    <TD>{asset.organisation ? <NameCell href={`/super-admin/orgs/${asset.organisation.id}`} name={asset.organisation.name} /> : "—"}</TD>
                    <TD className="tabular-nums text-sm">{asset.contentType ?? "unknown"}</TD>
                    <TD className="text-right tabular-nums">{formatBytes(asset.byteSize == null ? null : Number(asset.byteSize))}</TD>
                    <TD className="whitespace-nowrap text-ink-secondary">{asset.createdAt.toLocaleString()}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </AdminPanel>
      </div>

      <AdminPanel title="Largest tables (top 25)">
        {tableSizes == null ? (
          <p className="text-body-ui text-ink-muted">Unavailable (DB functions may be restricted).</p>
        ) : (
          <Table label="Largest tables">
            <THead>
              <tr>
                <TH>Table</TH>
                <TH className="text-right">Bytes</TH>
                <TH className="text-right">Pretty</TH>
              </tr>
            </THead>
            <TBody>
              {tableSizes.map((t) => (
                <TR key={t.table_name}>
                  <TD className="tabular-nums text-sm">{t.table_name}</TD>
                  <TD className="text-right tabular-nums">{t.total_bytes.toLocaleString()}</TD>
                  <TD className="text-right tabular-nums">{t.total_pretty}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </AdminPanel>

      <AdminPanel title="Per-org logical footprint (counts)">
        <Table label="Per-org logical footprint">
          <THead>
            <tr>
              <TH>Org</TH>
              <TH className="text-right">Assets bytes</TH>
              <TH className="text-right">Team</TH>
            </tr>
          </THead>
          <TBody>
            {perOrgCounts.map((o) => (
              <TR key={o.id}>
                <TD><NameCell href={`/super-admin/orgs/${o.id}`} name={o.name} sub={`/o/${o.slug}`} /></TD>
                <TD className="text-right tabular-nums">{formatBytes(assetTotals.get(o.id) ?? 0)}</TD>
                <TD className="text-right tabular-nums">{o._count.teamMembers}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </AdminPanel>
    </div>
  );
}
