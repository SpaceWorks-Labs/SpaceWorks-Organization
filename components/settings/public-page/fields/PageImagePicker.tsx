"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { pageImageUrl } from "@/lib/publicPage/sections";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { ImageUploadButton } from "../ImageUploadButton";

/**
 * Pick one of the organisation's page images (already uploaded, newest first) or upload a new one. Only those keys can
 * be chosen, so the image is always this organisation's own; the server checks again on save.
 */
export function PageImagePicker({ slug, label, value, images, disabled, error, onChange }: {
  slug: string;
  label: string;
  value: string | null;
  /** The organisation's page-image keys. */
  images: string[];
  disabled: boolean;
  error?: string;
  onChange: (key: string | null) => void;
}) {
  // Images uploaded here this visit, so they can be picked again before the page reloads its list.
  const [uploaded, setUploaded] = useState<string[]>([]);
  const choices = [...uploaded.filter((key) => !images.includes(key)), ...images];
  const [browsing, setBrowsing] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-label text-ink">{label}</p>
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element -- uploaded through the app's own storage route
        <img src={pageImageUrl(value)} alt="" className="aspect-[4/3] w-full max-w-[280px] rounded-xl border border-line object-cover" />
      ) : <p className="text-body-ui text-ink-muted">No image chosen.</p>}
      {error ? <p className="text-caption text-danger-fg">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {choices.length ? (
          <Button type="button" size="sm" variant="secondary" disabled={disabled} aria-expanded={browsing} onClick={() => setBrowsing(!browsing)}>
            {browsing ? "Hide your images" : "Choose from your images"}
          </Button>
        ) : null}
        <ImageUploadButton
          slug={slug}
          label="Upload an image"
          disabled={disabled}
          onUploaded={(key) => {
            setUploaded((current) => [key, ...current]);
            onChange(key);
          }}
        />
        {value ? <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(null)}><X aria-hidden className="size-4" />Remove image</Button> : null}
      </div>
      {browsing && choices.length ? (
        <div role="group" aria-label="Your page images" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {choices.map((key, index) => (
            <button
              key={key}
              type="button"
              aria-pressed={key === value}
              disabled={disabled}
              onClick={() => {
                onChange(key);
                setBrowsing(false);
              }}
              className={cn(
                "overflow-hidden rounded-lg border-2 transition-colors duration-(--sw-dur-fast) ease-sw",
                key === value ? "border-ink" : "border-line hover:border-line-strong",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- uploaded through the app's own storage route */}
              <img src={pageImageUrl(key)} alt={`Image ${index + 1}`} loading="lazy" className="aspect-square w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
