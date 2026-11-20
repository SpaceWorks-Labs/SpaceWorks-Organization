import Link from "next/link";
import { ArrowRight, Check, KeyRound, ToggleRight } from "lucide-react";
import type { FeatureArea } from "@/lib/features/catalog";
import { docsPath } from "@/lib/openSource";
import { AREA_ICONS } from "./areaIcons";
import { FeatureText } from "./FeatureText";

function Panel({ title, icon, items, check = false, className }: { title: string; icon?: React.ReactNode; items: readonly string[]; check?: boolean; className?: string }) {
  return (
    <div className={`grid content-start gap-4 rounded-xl border border-line bg-panel p-5 md:p-6 ${className ?? ""}`}>
      <h3 className="flex items-center gap-2 text-title text-ink">
        {icon}
        {title}
      </h3>
      <ul className="grid gap-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3 text-body-ui text-ink-secondary">
            {check ? <Check aria-hidden className="mt-1 size-4 shrink-0 text-success-solid" /> : <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-ink-muted" />}
            <span className="min-w-0">
              <FeatureText text={item} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One area on /features: what it does, who can use it, how to switch it on or off, and its docs page. */
export function FeatureAreaSection({ area }: { area: FeatureArea }) {
  const Icon = AREA_ICONS[area.id];
  return (
    <section id={area.id} aria-labelledby={`${area.id}-title`} className="grid gap-6 border-t border-line py-12 first:border-t-0 first:pt-0 lg:py-16" data-reveal="">
      <header className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span aria-hidden className="inline-grid size-11 place-items-center rounded-lg bg-accent-soft text-accent-text">
            <Icon className="size-5" />
          </span>
          {area.since ? <span className="rounded-full bg-info-mark px-2.5 py-0.5 text-caption font-semibold text-on-info-mark">New in {area.since}</span> : null}
        </div>
        <h2 id={`${area.id}-title`} className="font-display text-[2rem] leading-tight tracking-[-0.02em] text-ink">{area.title}</h2>
        <p className="sw-land-lede">
          <FeatureText text={area.summary} />
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="What it does" items={area.does} check className="md:col-span-2" />
        <Panel title="Who can use it" icon={<KeyRound aria-hidden className="size-4 text-accent-text" />} items={area.who} />
        <Panel title="Turning it on or off" icon={<ToggleRight aria-hidden className="size-4 text-accent-text" />} items={area.toggle} />
      </div>
      <Link href={docsPath(area.docsSlug)} className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-control font-semibold text-accent-text underline underline-offset-4">
        Read the {area.title.toLowerCase()} docs
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </section>
  );
}
