import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import type { AreaContext, AreaEntry } from "@/lib/publicPage/blockData";

/*
 * Ways around an area page (/o/<slug>/a/<code>): a breadcrumb back up through the organisation and the areas above,
 * and, at the foot, the other areas on the same level with a link back to the organisation's page.
 */

const LINK = "rounded-sm underline-offset-4 hover:text-ink hover:underline";
/** More than this many sibling areas link to the organisation's page instead of listing every one. */
export const MAX_OTHER_AREAS = 30;

/** Organisation › area above › … › this area (the last is the current page, not a link). */
export function AreaBreadcrumb({ orgName, orgSlug, area }: { orgName: string; orgSlug: string; area: Pick<AreaContext, "trail"> }) {
  const above = area.trail.slice(0, -1);
  const current = area.trail.at(-1);
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-body-ui text-ink-secondary">
        <li className="flex min-h-11 items-center"><Link href={`/o/${orgSlug}`} className={LINK}>{orgName}</Link></li>
        {above.map((step) => (
          <li key={step.code} className="flex min-h-11 items-center gap-1.5">
            <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
            <Link href={step.pageHref} className={LINK}>{step.name}</Link>
          </li>
        ))}
        {current ? (
          <li className="flex min-h-11 items-center gap-1.5">
            <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
            <span aria-current="page" className="font-semibold text-ink">{current.name}</span>
          </li>
        ) : null}
      </ol>
    </nav>
  );
}

/** The areas beside this one (same parent), in tree order. */
export function siblingAreas(area: Pick<AreaContext, "id">, areas: readonly AreaEntry[]): AreaEntry[] {
  const self = areas.find((entry) => entry.id === area.id);
  if (!self) return [];
  return areas.filter((entry) => entry.id !== self.id && entry.parentId === self.parentId && entry.level === self.level);
}

/** The foot of an area page: the other areas on its level and the way back to the whole organisation. */
export function OtherAreas({ orgName, orgSlug, area, areas }: { orgName: string; orgSlug: string; area: Pick<AreaContext, "id">; areas: readonly AreaEntry[] }) {
  const siblings = siblingAreas(area, areas);
  const shown = siblings.slice(0, MAX_OTHER_AREAS);
  return (
    <nav aria-labelledby="other-areas" className="sw-display-headings flex flex-col gap-6 border-t border-line pt-10">
      <h2 id="other-areas" className="text-h2 text-ink">{siblings.length ? "Other areas" : `More from ${orgName}`}</h2>
      {shown.length ? (
        <ul className="flex flex-wrap gap-2.5">
          {shown.map((entry) => (
            <li key={entry.id} className="max-w-full">
              <Link href={entry.pageHref} className="inline-flex min-h-11 max-w-full items-center rounded-full border border-line-strong bg-panel px-4 py-2 text-body-ui font-medium break-words text-ink transition-colors duration-(--sw-dur-fast) ease-sw hover:bg-muted">
                {entry.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {siblings.length > shown.length ? <p className="text-body-ui text-ink-secondary">{siblings.length - shown.length} more on the organisation&apos;s page.</p> : null}
      <Link href={`/o/${orgSlug}`} className={`${LINK} inline-flex min-h-11 w-fit items-center gap-2 text-label font-semibold text-ink`}>
        <ArrowLeft aria-hidden className="size-4" />
        Back to {orgName}
      </Link>
    </nav>
  );
}
