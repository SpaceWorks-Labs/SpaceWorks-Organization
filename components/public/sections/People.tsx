import { ArrowUpRight, Quote } from "lucide-react";
import { isExternalLink, pageImageUrl, type SectionOf } from "@/lib/publicPage/sections";
import { Avatar } from "@/components/ui/display";
import { DelightList } from "./DelightList";
import { externalProps, LEDE } from "./shared";

/** Office bearers: a photo (or initials), the name, the title and an optional link. Typed in by the organisation. */
export function Committee({ section }: { section: SectionOf<"committee"> }) {
  return (
    <div className="flex flex-col gap-8">
      {section.intro ? <p className={LEDE}>{section.intro}</p> : null}
      <DelightList className="grid grid-cols-2 gap-x-4 gap-y-8 @xl:grid-cols-3 @4xl:grid-cols-4">
        {section.people.map((person, index) => {
          const external = person.url ? isExternalLink(person.url) : false;
          return (
            <li key={index} className="flex min-w-0 flex-col gap-3">
              {person.photoKey ? (
                // eslint-disable-next-line @next/next/no-img-element -- page images are served by the app's own upload route
                <img src={pageImageUrl(person.photoKey)} alt="" width={320} height={320} loading="lazy" className="aspect-square w-full rounded-2xl border border-line bg-surface object-cover" />
              ) : (
                <div aria-hidden className="flex aspect-square w-full items-center justify-center rounded-2xl bg-accent-soft">
                  <Avatar name={person.name} size="xl" tone="accent" className="bg-transparent" />
                </div>
              )}
              <div className="flex min-w-0 flex-col gap-0.5">
                <h3 className="break-words text-h4 text-ink">{person.name}</h3>
                {person.role ? <p className="break-words text-body-ui text-ink-secondary">{person.role}</p> : null}
                {person.url ? (
                  <a href={person.url} className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 rounded-control px-1 text-label font-semibold text-accent-text underline-offset-4 hover:underline" {...externalProps(external)}>
                    {person.url.startsWith("mailto:") ? "Email" : "Profile"}
                    <span className="sr-only"> for {person.name}{external ? " (opens in a new tab)" : ""}</span>
                    {external ? <ArrowUpRight aria-hidden className="size-4" /> : null}
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
      </DelightList>
    </div>
  );
}

/** What members say: each quote in its own panel, the person and their role under it. */
export function Testimonials({ section }: { section: SectionOf<"testimonials"> }) {
  return (
    <DelightList className="grid grid-cols-1 gap-5 @2xl:grid-cols-2 @5xl:grid-cols-3">
      {section.items.map((item, index) => (
        <li key={index} className="flex">
          <figure className="flex w-full flex-col gap-5 rounded-2xl border border-line bg-panel p-6 @xl:p-8">
            <Quote aria-hidden className="size-7 text-accent-text" />
            <blockquote className="flex-1 whitespace-pre-wrap text-body-l text-pretty text-ink">{item.quote}</blockquote>
            <figcaption className="flex flex-col border-t border-line pt-4">
              <span className="text-label font-semibold text-ink">{item.name}</span>
              {item.role ? <span className="text-caption text-ink-muted">{item.role}</span> : null}
            </figcaption>
          </figure>
        </li>
      ))}
    </DelightList>
  );
}

/** Milestones in order, on a rule down the left: the year or date in the accent, then what happened. */
export function Timeline({ section }: { section: SectionOf<"timeline"> }) {
  return (
    <ol className="flex max-w-[760px] flex-col border-l-2 border-line">
      {section.items.map((item, index) => (
        <li key={index} className="relative flex flex-col gap-1.5 pb-10 pl-7 last:pb-0 @xl:pl-10">
          <span aria-hidden className="absolute -left-[7px] top-1.5 size-3 rounded-full border-2 border-canvas bg-accent" />
          <p className="text-label font-semibold tabular-nums text-accent-text">{item.date}</p>
          <h3 className="text-h3 text-balance text-ink">{item.title}</h3>
          {item.body ? <p className="whitespace-pre-wrap text-body-ui text-pretty text-ink-secondary">{item.body}</p> : null}
        </li>
      ))}
    </ol>
  );
}
