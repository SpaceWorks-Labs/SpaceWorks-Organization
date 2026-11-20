import Link from "next/link";
import type { ReactNode } from "react";
import { OrgLogo } from "@/components/ui/display";

/**
 * Compact header for an organisation's sub-pages (Members, Settings):
 * logo, "Org / Page" breadcrumb (a labelled nav with an ordered list, the current page marked), title, one-line
 * description and actions.
 */
export function OrgPageHeader({
  organisation,
  title,
  description,
  actions,
}: {
  organisation: { name: string; slug: string; logoUrl: string | null };
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <OrgLogo name={organisation.name} src={organisation.logoUrl} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
            <li>
              <Link href={`/dashboard/${organisation.slug}`} className="underline-offset-4 hover:text-ink hover:underline">
                {organisation.name}
              </Link>
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden>/</span>
              <span aria-current="page">{title}</span>
            </li>
          </ol>
        </nav>
        <h1 className="text-h1 text-ink">{title}</h1>
        {description ? <p className="text-body-ui text-ink-secondary">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </header>
  );
}
