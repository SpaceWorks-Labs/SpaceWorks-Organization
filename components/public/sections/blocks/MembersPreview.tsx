import type { SampleCard } from "@/lib/publicPage/live";
import type { SectionOf } from "@/lib/publicPage/sections";
import { Chip } from "@/components/ui/display";
import { cn } from "@/lib/cn";
import { LEDE } from "../shared";
import styles from "../sections.module.css";
import { BlockIcon } from "./icon";

/**
 * The sample card, drawn with made-up holder details (never a real member). It carries the organisation's logo, so it
 * never moves: data-tenant-logo keeps reveal and route motion off it.
 */
function SampleCardFigure({ card, orgName }: { card: SampleCard; orgName: string }) {
  const portrait = card.heightMm > card.widthMm;
  const scale = 8;
  return (
    <figure data-tenant-logo className={cn(styles.card, portrait && styles.portrait, "flex flex-col items-center gap-3 @4xl:items-end")}>
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
      <figcaption className="flex flex-col items-center gap-2 text-center @4xl:items-end @4xl:text-right">
        <Chip tone="info" size="sm">Sample card</Chip>
        <span className="max-w-[320px] text-caption text-ink-muted">Each member&apos;s card shows their own name and a QR code anyone can scan to check it.</span>
      </figcaption>
    </figure>
  );
}

/** What members get after joining: points with check marks and, when asked for, the sample card. */
export function MembersPreview({ section, card, orgName }: { section: SectionOf<"membersPreview">; card: SampleCard | null; orgName: string }) {
  const showCard = section.showCard && card;
  return (
    <div className="flex flex-col gap-8">
      {section.intro ? <p className={LEDE}>{section.intro}</p> : null}
      <div className={cn("grid items-center gap-10", showCard && "@4xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] @4xl:gap-14")}>
        {section.points.length ? (
          <ul className={cn("grid grid-cols-1 gap-4", !showCard && "@2xl:grid-cols-2 @2xl:gap-x-10")}>
            {section.points.map((point, index) => (
              <li key={index} className="flex items-start gap-3.5">
                <span aria-hidden className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text">
                  <BlockIcon id="check" className="size-4" />
                </span>
                <span className="min-w-0 break-words text-body-l text-ink">{point}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {showCard ? <SampleCardFigure card={card} orgName={orgName} /> : null}
      </div>
    </div>
  );
}
