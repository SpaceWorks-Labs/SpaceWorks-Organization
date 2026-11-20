import type { PublicCounts, SampleCard } from "@/lib/publicPage/live";
import type { SectionOf } from "@/lib/publicPage/sections";
import { Chip } from "@/components/ui/display";
import { cn } from "@/lib/cn";
import { DelightList } from "./DelightList";
import { ActionRow, LEDE, type ActionContext } from "./shared";
import styles from "./sections.module.css";

/** A call to action: a headline, a line and up to two buttons, on the accent tint, a Deep Ink island or plain. */
export function CallToAction({ section, context }: { section: SectionOf<"cta">; context: ActionContext }) {
  const ink = section.tone === "ink";
  return (
    <div
      className={cn(
        "flex flex-col gap-6 rounded-2xl px-6 py-10 @xl:px-12 @xl:py-14",
        section.tone === "accent" && "bg-accent-soft",
        ink && "sw-dark-band border border-line bg-canvas",
        section.tone === "plain" && "border border-line bg-panel",
      )}
    >
      <div className="flex max-w-[760px] flex-col gap-4">
        {section.title ? <p className={cn("text-label font-semibold", ink ? "text-ink-muted" : "text-accent-text")}>{section.title}</p> : null}
        {section.headline ? <h2 id={`heading-${section.id}`} className="text-display-m text-balance text-ink">{section.headline}</h2> : null}
        {section.body ? <p className={cn(LEDE, ink && "text-ink-muted")}>{section.body}</p> : null}
      </div>
      <ActionRow primary={section.primary} secondary={section.secondary} context={context} onDark={ink} />
    </div>
  );
}

const number = (value: number, locale: string | null) => new Intl.NumberFormat(locale ?? "en-IN").format(value);

/** What a counts section would show; empty means the section is left out for visitors. */
export function countsToShow(section: SectionOf<"counts">, counts: PublicCounts | null) {
  return {
    total: section.total ? counts?.total ?? null : null,
    byPlan: section.byPlan ? counts?.byPlan ?? [] : [],
    byUnit: section.byUnit ? counts?.byUnit ?? [] : [],
  };
}

/** Live counts: aggregates only (small numbers are already removed by the loader), never names. */
export function Counts({ section, counts, locale, unitLabel }: { section: SectionOf<"counts">; counts: PublicCounts | null; locale: string | null; unitLabel: string }) {
  const shown = countsToShow(section, counts);
  const breakdown = (title: string, rows: Array<{ label: string; count: number }>) => rows.length ? (
    <div className="flex flex-col gap-3">
      <h3 className="text-h4 text-ink">{title}</h3>
      <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-panel">
        {rows.map((row) => (
          <li key={row.label} className="flex items-baseline justify-between gap-4 px-5 py-3.5">
            <span className="min-w-0 break-words text-body-ui text-ink">{row.label}</span>
            <span className="shrink-0 font-display text-h3 font-extrabold tabular-nums text-ink">{number(row.count, locale)}</span>
          </li>
        ))}
      </ul>
    </div>
  ) : null;
  return (
    <div className="flex flex-col gap-8">
      {section.intro ? <p className={LEDE}>{section.intro}</p> : null}
      <div className={cn("grid gap-8", (shown.byPlan.length || shown.byUnit.length) && shown.total !== null && "@4xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] @4xl:items-start")}>
        {shown.total !== null ? (
          <p className="flex flex-col gap-1">
            <span className="font-display text-[3.5rem] font-extrabold leading-none tracking-tight tabular-nums text-ink @xl:text-[5rem]">{number(shown.total, locale)}</span>
            <span className="text-body-l text-ink-secondary">current members</span>
          </p>
        ) : null}
        {shown.byPlan.length || shown.byUnit.length ? (
          <div className="grid gap-8 @2xl:grid-cols-2">
            {breakdown("By plan", shown.byPlan)}
            {breakdown(`By ${unitLabel.toLowerCase()}`, shown.byUnit)}
          </div>
        ) : null}
      </div>
      <p className="text-caption text-ink-muted">Members with a current membership. Numbers under 5 aren&apos;t shown.</p>
    </div>
  );
}

/**
 * The organisation's approved card design, drawn with a fictional name. The card carries the organisation's logo, so
 * it never moves: data-tenant-logo keeps reveal and route motion off it; only the words beside it reveal.
 */
export function CardShowcase({ section, card, orgName }: { section: SectionOf<"card">; card: SampleCard; orgName: string }) {
  const portrait = card.heightMm > card.widthMm;
  const scale = 8;
  return (
    <div className="grid items-center gap-10 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] @2xl:gap-14">
      <div data-reveal data-route-enter className="flex flex-col gap-4">
        {section.intro ? <p className={LEDE}>{section.intro}</p> : null}
        <p className="text-body-ui text-ink-muted">This is a sample with a made-up name. Each member&apos;s card shows their own details and a QR code anyone can scan to check it.</p>
      </div>
      <figure data-tenant-logo className={cn(styles.card, portrait && styles.portrait, "flex flex-col items-center gap-3 @2xl:items-end")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- drawn on demand by the app's own sample card route */}
        <img
          src={card.src}
          alt={`A sample ${orgName} member card with a made-up name`}
          width={Math.round(card.widthMm * scale)}
          height={Math.round(card.heightMm * scale)}
          loading="lazy"
          style={{ aspectRatio: `${card.widthMm} / ${card.heightMm}` }}
          className="h-auto w-full border border-line-strong bg-surface"
        />
        <figcaption><Chip tone="info" size="sm">Sample card</Chip></figcaption>
      </figure>
    </div>
  );
}

/** Figures the organisation types in: big display numbers with a label. */
export function Stats({ section }: { section: SectionOf<"stats"> }) {
  return (
    <DelightList as="dl" className="grid grid-cols-2 gap-x-6 gap-y-10 @4xl:grid-cols-4">
      {section.items.map((item, index) => (
        <div key={index} className="flex flex-col-reverse gap-2 border-t-2 border-accent pt-5">
          <dt className="text-body-ui text-ink-secondary">{item.label}</dt>
          <dd className="font-display text-[2.5rem] font-extrabold leading-none tracking-tight tabular-nums break-words text-ink @xl:text-[3.25rem]">{item.value}</dd>
        </div>
      ))}
    </DelightList>
  );
}
