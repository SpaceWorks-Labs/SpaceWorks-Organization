import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FEATURE_AREAS } from "@/lib/features/catalog";
import { AREA_ICONS } from "./areaIcons";

/**
 * A headline per feature area, from the one catalogue (lib/features/catalog.ts), each opening its section on
 * /features. The detail lives there, not here.
 */
export function AreasSection() {
  return (
    <section id="areas" aria-labelledby="areas-title" className="sw-land-section">
      <div className="sw-land-wrap">
        <div className="sw-land-split" data-reveal="">
          <h2 id="areas-title" className="sw-land-h2">Everything a committee runs, area by area.</h2>
          <div className="grid gap-3">
            <p className="sw-land-lede">
              Each organisation is its own space, with its own units, team, plans and money. Open an area to see what it
              does, who can use it and how to switch it on.
            </p>
            <Link href="/features" className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-control font-semibold text-accent-text underline underline-offset-4">
              Every area on one page
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
        </div>
        <ul className="mt-10 grid border-t border-line lg:mt-14 lg:grid-cols-2 lg:gap-x-12" data-reveal="">
          {FEATURE_AREAS.map((area) => {
            const Icon = AREA_ICONS[area.id];
            return (
              <li key={area.id} className="border-b border-line">
                <Link
                  href={`/features#${area.id}`}
                  className="group grid grid-cols-[40px_minmax(0,1fr)_20px] items-start gap-4 rounded-lg px-2 py-6 transition-colors duration-(--sw-dur-fast) hover:bg-muted sm:px-3"
                >
                  <span aria-hidden className="inline-grid size-10 place-items-center rounded-lg bg-accent-soft text-accent-text">
                    <Icon className="size-5" />
                  </span>
                  <div className="grid gap-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h3 className="text-h4 text-ink">{area.title}</h3>
                      {area.since ? <span className="rounded-full bg-info-mark px-2.5 py-0.5 text-caption font-semibold text-on-info-mark">New in {area.since}</span> : null}
                    </div>
                    <p className="text-body-ui text-ink-muted">{area.summary}</p>
                  </div>
                  <ArrowRight aria-hidden className="mt-2 size-5 text-ink-muted transition-colors duration-(--sw-dur-fast) group-hover:text-ink" />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
