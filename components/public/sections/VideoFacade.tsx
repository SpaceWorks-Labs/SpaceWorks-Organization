"use client";

import { useState } from "react";
import { ArrowUpRight, Play } from "lucide-react";
import type { VideoEmbed } from "@/lib/publicPage/embeds";

const PROVIDER = { youtube: "YouTube", vimeo: "Vimeo" } as const;

/**
 * A video that loads nothing from YouTube or Vimeo until the visitor chooses to play it (privacy first: no frame, no
 * cookies, no requests before then). The frame comes only from the allow-listed players in lib/publicPage/embeds.ts,
 * which the page's CSP permits on /o/* alone. In the editor preview it never loads.
 */
export function VideoFacade({ embed, title, preview }: { embed: VideoEmbed; title: string; preview: boolean }) {
  const [playing, setPlaying] = useState(false);
  const provider = PROVIDER[embed.provider];
  const frameTitle = title || `Video on ${provider}`;
  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-line bg-surface">
        {playing && !preview ? (
          <iframe
            src={`${embed.embedUrl}${embed.embedUrl.includes("?") ? "&" : "?"}autoplay=1`}
            title={frameTitle}
            loading="lazy"
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 size-full"
          />
        ) : (
          <button
            type="button"
            disabled={preview}
            onClick={() => setPlaying(true)}
            className="group absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center focus-visible:[outline-offset:-4px]"
          >
            <span aria-hidden className="flex size-16 items-center justify-center rounded-full bg-accent text-on-accent transition-colors duration-(--sw-dur-fast) ease-sw group-hover:bg-[color-mix(in_srgb,var(--sw-accent)_88%,var(--sw-ink))] @xl:size-20">
              <Play className="ml-1 size-7 fill-current @xl:size-8" />
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-label font-semibold text-ink">Play video{title ? `: ${title}` : ""}</span>
              <span className="text-caption text-ink-muted">{preview ? `Plays from ${provider} on your live page` : `Loads from ${provider} when you play it`}</span>
            </span>
          </button>
        )}
      </div>
      <a href={embed.watchUrl} target="_blank" rel="noopener noreferrer nofollow ugc" className="inline-flex min-h-11 w-fit items-center gap-1 text-label font-semibold text-accent-text underline-offset-4 hover:underline">
        Watch on {provider}
        <ArrowUpRight aria-hidden className="size-4" />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </div>
  );
}
