import type { ReactNode } from "react";
import { Download } from "lucide-react";
import type { ReportShell as ShellData } from "@/lib/reports/shell";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { buttonClasses } from "@/components/ui/button";
import { ReportFilters } from "./ReportFilters";
import { ReportTabs } from "./ReportTabs";

/** Link to an audited, streamed CSV export of one report with the current filters. */
export function ExportLink({ shell, report, label = "Export CSV", extra = "" }: { shell: ShellData; report: string; label?: string; extra?: string }) {
  const query = shell.query ? `${shell.query}${extra ? `&${extra}` : ""}` : extra ? `?${extra}` : "";
  return (
    <a href={`/api/exports/reports/${shell.org.slug}/${report}${query}`} className={buttonClasses({ variant: "secondary", size: "sm", className: "sw-print-hide" })} download>
      <Download aria-hidden className="size-4" />
      {label}
    </a>
  );
}

/**
 * Every report page: breadcrumb heading, the scope line (period, and the unit when the viewer is limited
 * to one), tabs that keep the filters, the filter row, then the report itself.
 */
export function ReportShell({ shell, title, description, actions, children, hideFilters = false }: { shell: ShellData; title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode; hideFilters?: boolean }) {
  const unitLabel = shell.units[0]?.levelName ?? "Unit";
  return (
    <div className="flex flex-col gap-5">
      <OrgPageHeader
        organisation={shell.org}
        title={title}
        description={
          description ?? (
            <>
              {shell.period.label}
              {shell.scopedUnitName ? <> · {shell.scopedUnitName} and everything under it</> : null}
            </>
          )
        }
        actions={actions}
      />
      <ReportTabs slug={shell.org.slug} query={shell.query} finance={shell.tabs.finance} activity={shell.tabs.activity} units={shell.tabs.units} />
      {hideFilters ? null : <ReportFilters plans={shell.plans} units={shell.units} initial={shell.filters} unitLabel={unitLabel} />}
      <div className="flex flex-col gap-5 transition-opacity duration-200 [[data-pending]~&]:opacity-60">{children}</div>
    </div>
  );
}
