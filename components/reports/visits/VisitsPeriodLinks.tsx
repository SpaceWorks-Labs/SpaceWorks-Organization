import Link from "next/link";
import { cn } from "@/lib/cn";

const PRESETS = [{ value: "30d", label: "Last 30 days" }, { value: "90d", label: "Last 90 days" }, { value: "12m", label: "Last 12 months" }, { value: "fy", label: "This financial year" }];

/** Period choices for the visits report as plain links, so it works without script and can be bookmarked. */
export function VisitsPeriodLinks({ slug, active }: { slug: string; active: string }) {
  return (
    <nav aria-label="Period" className="sw-print-hide flex flex-wrap gap-2">
      {PRESETS.map((preset) => (
        <Link
          key={preset.value}
          href={`/dashboard/${slug}/reports/visits?period=${preset.value}`}
          aria-current={active === preset.value ? "page" : undefined}
          className={cn("inline-flex min-h-11 items-center rounded-control border px-3.5 text-sm transition-colors", active === preset.value ? "border-primary bg-primary font-semibold text-on-primary" : "border-line bg-panel text-ink hover:bg-muted")}
        >
          {preset.label}
        </Link>
      ))}
    </nav>
  );
}
