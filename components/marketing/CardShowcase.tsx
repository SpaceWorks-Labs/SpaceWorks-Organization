import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SAMPLE_CARDS } from "@/lib/marketing/sampleCards";
import { CardDeck } from "./CardDeck";

/**
 * Sample member cards, drawn by the product's own card renderer (scripts/render-landing-cards.ts, from
 * lib/marketing/sampleCards.ts): the Space Works team on SpaceWorks cards, each in a different built-in design.
 * They drift in a slow loop with a Pause button, and stand still with reduced motion (CardDeck).
 */
export function CardShowcase() {
  return (
    <section id="cards" aria-labelledby="cards-title" className="sw-land-section">
      <div className="sw-land-wrap">
        <div className="sw-land-split" data-reveal="">
          <h2 id="cards-title" className="sw-land-h2">Cards your members carry.</h2>
          <p className="sw-land-lede">
            Every organisation sets its own card: its logo, its colours and its card numbers. Here is the Space Works team
            on SpaceWorks cards in six of the built-in designs, drawn by Space Works Organization itself.
          </p>
        </div>
        <figure className="mt-10 lg:mt-14">
          <CardDeck cards={SAMPLE_CARDS} />
          <figcaption className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3" data-reveal="">
            <p className="max-w-2xl text-body text-ink-muted">
              Samples. Each card is drawn on demand from its organisation’s approved design and never stored, and it stays
              live through renewals: the QR code checks the membership as it stands today.
            </p>
            <Link
              href="/features#member-cards"
              className="inline-flex items-center gap-1.5 text-label font-semibold text-accent-text underline underline-offset-4"
            >
              About member cards
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
