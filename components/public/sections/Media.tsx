import { Download, FileText } from "lucide-react";
import { videoEmbed } from "@/lib/publicPage/embeds";
import { isPageFileKey, pageFileUrl, pageImageUrl, type SectionOf } from "@/lib/publicPage/sections";
import { Markdown } from "@/components/public/Markdown";
import { cn } from "@/lib/cn";
import { ActionRow, LEDE, PROSE, type ActionContext } from "./shared";
import { VideoFacade } from "./VideoFacade";

/** A photo beside a block of text (left or right from 768px, stacked with the photo first on phones). */
export function ImageText({ section, context }: { section: SectionOf<"imageText">; context: ActionContext }) {
  const image = section.imageKey ? pageImageUrl(section.imageKey) : null;
  return (
    <div className={cn("grid items-center gap-8", image && "@2xl:grid-cols-2 @2xl:gap-12 @4xl:gap-16")}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- page images are served by the app's own upload route
        <img src={image} alt={section.imageAlt} width={800} height={600} loading="lazy" className={cn("aspect-[4/3] w-full rounded-2xl border border-line object-cover", section.side === "right" && "@2xl:order-last")} />
      ) : null}
      <div className={cn("flex flex-col gap-6", PROSE)}>
        {section.markdown ? <Markdown source={section.markdown} /> : null}
        <ActionRow primary={section.primary} context={context} />
      </div>
    </div>
  );
}

/** Up to 12 photos in a still grid; the first is larger from 768px when there are enough to frame it. */
export function Gallery({ section }: { section: SectionOf<"gallery"> }) {
  const feature = section.images.length >= 5;
  return (
    <ul className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @2xl:gap-4">
      {section.images.map((image, index) => (
        <li key={image.key} className={cn(feature && index === 0 && "col-span-2 @2xl:row-span-2")}>
          {/* eslint-disable-next-line @next/next/no-img-element -- gallery images are served by the app's own upload route */}
          <img src={pageImageUrl(image.key)} alt={image.alt} width={600} height={450} loading="lazy" className={cn("aspect-[4/3] h-full w-full rounded-2xl border border-line object-cover", feature && index === 0 && "@2xl:aspect-auto")} />
        </li>
      ))}
    </ul>
  );
}

/** Files to download: the organisation's own page uploads only, each with its name and a 44px download link. */
export function Downloads({ section }: { section: SectionOf<"downloads"> }) {
  return (
    <div className="flex flex-col gap-6">
      {section.intro ? <p className={LEDE}>{section.intro}</p> : null}
      <ul className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
        {section.files.map((file) => (
          <li key={file.key} className="flex items-center gap-4 rounded-2xl border border-line bg-panel p-3 pr-4">
            {isPageFileKey(file.key) ? (
              <span aria-hidden className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-line bg-muted text-ink-muted"><FileText className="size-6" /></span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- page images are served by the app's own upload route
              <img src={pageImageUrl(file.key)} alt="" width={64} height={64} loading="lazy" className="size-16 shrink-0 rounded-lg border border-line object-cover" />
            )}
            <span className="min-w-0 flex-1 break-words text-label font-semibold text-ink">{file.label}</span>
            <a href={isPageFileKey(file.key) ? pageFileUrl(file.key, file.label) : pageImageUrl(file.key)} download className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-control border border-line-strong bg-panel px-4 text-label font-semibold text-ink hover:bg-muted">
              <Download aria-hidden className="size-4" />
              Download<span className="sr-only"> {file.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A YouTube or Vimeo video behind a play button, with its caption. An address that isn't allowed shows nothing. */
export function Video({ section, preview }: { section: SectionOf<"video">; preview: boolean }) {
  const embed = videoEmbed(section.url);
  if (!embed) return null;
  return (
    <figure className="flex max-w-[960px] flex-col gap-3">
      <VideoFacade embed={embed} title={section.title || section.caption} preview={preview} />
      {section.caption ? <figcaption className="text-body-ui text-ink-secondary">{section.caption}</figcaption> : null}
    </figure>
  );
}
