import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { FAQ } from "./landingData";

/** The common questions, as native disclosures (keyboard and screen-reader friendly without script). */
export function FaqSection() {
  return (
    <section id="questions" aria-labelledby="questions-title" className="sw-land-section">
      <div className="sw-land-wrap grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16" data-reveal="">
        <h2 id="questions-title" className="sw-land-h2">Questions committees ask.</h2>
        <div className="border-t border-line">
          {FAQ.map((item) => (
            <details key={item.q} className="group border-b border-line">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 rounded-md py-4 text-h4 text-ink [&::-webkit-details-marker]:hidden">
                {item.q}
                <span aria-hidden className="relative size-4 shrink-0">
                  <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-ink" />
                  <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-ink transition-transform duration-(--sw-dur-base) ease-sw group-open:scale-y-0" />
                </span>
              </summary>
              <p className="max-w-[60ch] pb-5 text-body-ui text-ink-muted">
                {item.a}
                {item.more ? (
                  <>
                    {" "}
                    <Link href={item.more.href} className="font-semibold text-ink underline underline-offset-4 transition-colors duration-(--sw-dur-fast) ease-sw hover:text-primary">
                      {item.more.label}
                    </Link>
                  </>
                ) : null}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/** The closing call to action, back on the quiet symbol pattern. */
export function CloseSection() {
  return (
    <section aria-labelledby="close-title" className="sw-land-pattern sw-land-section">
      <div className="sw-land-wrap grid justify-items-center gap-6 text-center" data-reveal="">
        <h2 id="close-title" className="sw-land-h2 max-w-[18ch]">Start next year with a clean register.</h2>
        <p className="sw-land-lede">
          Tell us about your organisation. Once it is approved, add your plans and share your join link before renewals
          come round.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/start" className={buttonClasses({ variant: "primary", size: "lg" })}>
            Apply for your organisation
            <ArrowRight aria-hidden className="size-4" />
          </Link>
          <Link href="/login" className={buttonClasses({ variant: "secondary", size: "lg" })}>Sign in</Link>
        </div>
      </div>
    </section>
  );
}
