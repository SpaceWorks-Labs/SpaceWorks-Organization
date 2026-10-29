import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { ACTIVE, MONTHS, RECEIPT_LINES, TEAM, UNITS, YEAR } from "./landingData";
import { SAMPLE } from "./sample";
import { SectionHeading } from "./SectionHeading";

/** The membership year, April to March: every capability where it happens. */
export function YearSection() {
  return (
  <section aria-labelledby="how-it-works" className="landing-year scroll-mt-20 bg-canvas">
    <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-12 px-4 py-20 sm:px-6 lg:py-28">
      <SectionHeading id="how-it-works" title={<>Twelve months. <span className="font-accent" style={{ fontWeight: 700 }}>One card.</span></>}>
        Follow one sample member, {SAMPLE.name} of {SAMPLE.organisation}, through a membership year. Every step is something the committee no longer does by hand.
      </SectionHeading>

      <div aria-hidden className="flex flex-col gap-2">
        <div className="relative h-3">
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-emphasis">
            <div className="landing-ruler-fill absolute inset-0 rounded-full bg-primary" />
          </div>
          {/* The months where the timeline below has stops. */}
          {[0, 11].map((index) => (
            <span key={index} className="absolute top-0 size-3 -translate-x-1/2 rounded-full border-2 border-primary bg-canvas" style={{ left: `${((index + 0.5) / 12) * 100}%` }} />
          ))}
          <span className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full border-2 border-primary" style={{ left: `${(2 / 12) * 100}%`, width: `${(9 / 12) * 100}%` }} />
        </div>
        <div className="grid grid-cols-12 text-caption tabular-nums text-ink-muted">
          {MONTHS.map((month, index) => (
            <span key={month} className={cn(index === 0 && "font-semibold text-ink")}>
              <span className="sm:hidden">{month[0]}</span>
              <span className="max-sm:hidden">{month}</span>
            </span>
          ))}
        </div>
      </div>

      <ol className="relative flex flex-col">
        <span aria-hidden className="absolute bottom-6 left-[5.5rem] top-6 w-px bg-line max-sm:left-[0.4375rem]" />
        {YEAR.map((stop) => (
          <li key={`${stop.when}-${stop.title}`} className="sr-left relative grid gap-x-8 gap-y-2 py-6 max-sm:pl-8 sm:grid-cols-[4.5rem_minmax(0,1fr)] lg:grid-cols-[4.5rem_minmax(0,0.9fr)_minmax(0,1fr)]">
            <span aria-hidden className="absolute left-[5.25rem] top-[1.95rem] size-2.5 rounded-full border-2 border-primary bg-canvas max-sm:left-[0.1875rem]" />
            <p className="pt-0.5 text-label font-semibold tabular-nums text-ink-muted">{stop.when}</p>
            <div className="flex flex-col gap-1.5 sm:pl-6">
              <h3 className="text-h3 text-ink">{stop.title}</h3>
              <p className="max-w-[46ch] text-body-ui text-ink-secondary">{stop.body}</p>
            </div>
            <div className="sm:col-start-2 sm:pl-6 lg:col-start-3 lg:pl-0 lg:pt-1">{stop.proof}</div>
          </li>
        ))}
      </ol>
    </div>
  </section>

  );
}

/** Money: the receipt is the proof. */
export function MoneySection() {
  return (
  <section aria-labelledby="money" className="bg-sw-ink text-sw-cream dark:border-y dark:border-line dark:bg-[color-mix(in_srgb,var(--sw-ink)_55%,black)]">
    <div className="mx-auto grid w-full max-w-[1160px] items-center gap-14 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,1fr)_440px] lg:py-28">
      <div className="flex flex-col gap-8">
        <SectionHeading id="money" inverse title={<>Every rupee.<br />Accounted for.</>}>
          Receipts your treasurer can hand to an auditor. The tax is worked out for you, the paise add up, and nothing paid is ever quietly changed.
        </SectionHeading>
        <ul className="flex flex-col gap-4">
          {[
            "Razorpay, Stripe, or UPI and cash confirmed by a second treasurer.",
            "Receipt numbers never skip within a financial year, April to March.",
            "A mistake is reversed with a credit note, never edited away.",
          ].map((point) => (
            <li key={point} className="sr-left flex gap-3 text-body-ui text-sw-cream/85">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-sw-citron text-sw-ink">
                <Check aria-hidden className="size-3.5" />
              </span>
              {point}
            </li>
          ))}
        </ul>
      </div>

      <figure className="landing-print rounded-[20px] bg-sw-cream p-6 text-sw-ink shadow-[0_30px_70px_-30px_rgb(0_0_0/0.6)] sm:p-7">
        <div className="flex items-start justify-between gap-4 border-b border-dashed border-sw-ink/25 pb-4">
          <div>
            <p className="text-h4">{SAMPLE.organisation}</p>
            <p className="text-caption text-sw-ink/70">Kochi, Kerala · GSTIN 32ABCDE1234F1Z5</p>
          </div>
          <div className="text-right">
            <p className="text-caption font-semibold">Tax invoice</p>
            <p className="text-caption tabular-nums text-sw-ink/70">{SAMPLE.receipt}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 border-b border-dashed border-sw-ink/25 py-4 text-caption">
          <div>
            <p className="text-sw-ink/60">Billed to</p>
            <p className="font-semibold">{SAMPLE.name}</p>
          </div>
          <div>
            <p className="text-sw-ink/60">Place of supply</p>
            <p className="font-semibold">Kerala (32)</p>
          </div>
        </div>
        <dl className="flex flex-col gap-2 py-4 text-body-ui">
          {RECEIPT_LINES.map((line) => (
            <div key={line.label} className="flex items-baseline justify-between gap-4">
              <dt>{line.label}</dt>
              <dd className="tabular-nums">₹{line.value}</dd>
            </div>
          ))}
          <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-sw-ink/25 pt-3">
            <dt className="text-label font-semibold">Total paid</dt>
            <dd className="text-h3 tabular-nums">₹1,200.00</dd>
          </div>
        </dl>
        <figcaption className="flex flex-wrap items-center justify-between gap-2 text-caption text-sw-ink/70">
          <span>UPI · 2 Apr 2026</span>
          <span className="rounded-full bg-sw-yellow px-2.5 py-0.5 font-semibold text-sw-ink">Sample receipt</span>
        </figcaption>
      </figure>
    </div>
  </section>

  );
}

/** Scale: units, the team and a report. */
export function ScaleSection() {
  return (
  <section aria-labelledby="scale" className="bg-canvas">
    <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-12 px-4 py-20 sm:px-6 lg:py-28">
      <SectionHeading id="scale" title={<>One head office.<br />Every chapter.</>}>
        Run a single club, or a state body with district units and city chapters. Each committee sees its own members and numbers; the head office sees them all.
      </SectionHeading>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <figure className="sr-up flex flex-col gap-4 rounded-[20px] border border-line bg-panel p-6">
          <figcaption className="text-label font-semibold text-ink">Units</figcaption>
          <ul className="flex flex-col">
            <li className="flex items-center justify-between py-2 text-label font-semibold text-ink">
              <span>{SAMPLE.organisation}</span>
              <span className="tabular-nums text-ink-muted">268</span>
            </li>
            {UNITS.map((unit) => (
              <li key={unit.name} className="flex items-center justify-between border-t border-line py-2 text-body-ui text-ink" style={{ paddingLeft: `${(unit.depth + 1) * 1}rem` }}>
                <span className={cn(unit.name === "Kochi chapter" && "font-semibold")}>
                  {unit.name}
                  {unit.name === "Kochi chapter" ? <span className="ml-2 rounded-full bg-sw-citron px-2 py-0.5 text-caption text-sw-ink">Shaan</span> : null}
                </span>
                <span className="tabular-nums text-ink-muted">{unit.members}</span>
              </li>
            ))}
          </ul>
          <p className="mt-auto text-caption text-ink-muted">Sample members per unit</p>
        </figure>

        <figure className="sr-up flex flex-col gap-4 rounded-[20px] border border-line bg-panel p-6" style={{ ["--sr-offset" as string]: 8 }}>
          <figcaption className="text-label font-semibold text-ink">The SpaceWorks team</figcaption>
          <ul className="flex flex-col">
            {TEAM.map((person) => (
              <li key={person.name} className="flex flex-col gap-0.5 border-t border-line py-2.5 first:border-t-0 first:pt-0">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-label font-semibold text-ink">{person.name}</span>
                  <span className="text-caption text-ink-muted">{person.access}</span>
                </span>
                <span className="text-caption text-ink-secondary">{person.role}</span>
              </li>
            ))}
          </ul>
          <p className="mt-auto text-caption text-ink-muted">Sample team. Each role sets what that person can see and do.</p>
        </figure>

        <figure className="sr-up flex flex-col gap-4 rounded-[20px] border border-line bg-panel p-6" style={{ ["--sr-offset" as string]: 16 }}>
          <figcaption className="flex items-baseline justify-between gap-3">
            <span className="text-label font-semibold text-ink">Active members, 2026–27</span>
            <span className="text-h3 tabular-nums text-ink">268</span>
          </figcaption>
          <div className="flex h-36 items-end gap-1.5" role="img" aria-label="Sample chart: active members rise from 180 in April to 268 in March.">
            {ACTIVE.map((value, index) => (
              <span key={MONTHS[index]} className={cn("sr-bar flex-1 rounded-t-md", index === ACTIVE.length - 1 ? "bg-primary" : "bg-emphasis")} style={{ height: `${(value / 280) * 100}%`, ["--sr-offset" as string]: index * 2 }} />
            ))}
          </div>
          <div aria-hidden className="flex gap-1.5 text-center text-[11px] tabular-nums text-ink-muted">
            {MONTHS.map((month) => <span key={month} className="flex-1">{month[0]}</span>)}
          </div>
          <p className="mt-auto text-caption text-ink-muted">Sample report. Renewals, lapses, money collected and dues are reported the same way.</p>
        </figure>
      </div>
    </div>
  </section>

  );
}
