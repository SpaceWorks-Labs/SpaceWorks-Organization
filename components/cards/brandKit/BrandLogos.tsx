"use client";

import { useId, type ReactNode } from "react";
import Link from "next/link";
import { Pipette, Trash2 } from "lucide-react";
import { buttonClasses, IconButton } from "@/components/ui/button";
import { BRAND_KIT_LIMITS } from "@/lib/cards/brandKit";
import { cn } from "@/lib/cn";

function LogoTile({ url, label, children }: { url: string; label: string; children?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-line bg-panel p-2">
      {/* A muted tile, so white and transparent logos still show. */}
      <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted p-1">
        {/* eslint-disable-next-line @next/next/no-img-element -- managed uploads */}
        <img src={url} alt={label} className="size-full object-contain" />
      </span>
      <span className="min-w-0 flex-1 text-sm text-ink">{label}</span>
      {children}
    </li>
  );
}

/** The current logo (from Settings → Profile) and the kit's own variants, with upload, remove and "pick colours". */
export function BrandLogos({ organisationSlug, currentLogoUrl, logos, disabled, uploading, onUpload, onRemove, onExtract }: {
  organisationSlug: string;
  currentLogoUrl: string | null;
  logos: string[];
  disabled: boolean;
  uploading: boolean;
  onUpload: (file: File) => void;
  onRemove: (url: string) => void;
  onExtract: (url: string) => void;
}) {
  const inputId = useId();
  const full = logos.length >= BRAND_KIT_LIMITS.logos;
  const variants = logos.filter((url) => url !== currentLogoUrl);
  return (
    <section aria-labelledby="brand-logos-title" className="flex min-w-0 flex-col gap-3">
      <div>
        <h3 id="brand-logos-title" className="text-label font-semibold text-ink">Logos</h3>
        <p className="text-caption text-ink-muted">Your logo and up to {BRAND_KIT_LIMITS.logos} variants, such as a reversed or one-colour version.</p>
      </div>
      <ul className="flex flex-col gap-2">
        {currentLogoUrl ? (
          <LogoTile url={currentLogoUrl} label="Current logo">
            <IconButton label="Pick colours from the current logo" disabled={disabled} onClick={() => onExtract(currentLogoUrl)}>
              <Pipette />
            </IconButton>
          </LogoTile>
        ) : (
          <li className="rounded-lg border border-dashed border-line-strong p-3 text-caption text-ink-muted">
            No logo yet. <Link href={`/dashboard/${organisationSlug}/settings#profile`} className="font-semibold text-ink underline underline-offset-4">Add or make one in Profile</Link>.
          </li>
        )}
        {variants.map((url, index) => (
          <LogoTile key={url} url={url} label={`Variant ${index + 1}`}>
            <IconButton label={`Pick colours from variant ${index + 1}`} disabled={disabled} onClick={() => onExtract(url)}>
              <Pipette />
            </IconButton>
            <IconButton label={`Remove variant ${index + 1}`} variant="danger" disabled={disabled} onClick={() => onRemove(url)}>
              <Trash2 />
            </IconButton>
          </LogoTile>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={inputId}
          aria-disabled={disabled || full || uploading || undefined}
          className={buttonClasses({ variant: "secondary", size: "sm", className: cn("cursor-pointer has-[+input:focus-visible]:outline-2 has-[+input:focus-visible]:outline-offset-2 has-[+input:focus-visible]:outline-[rgb(var(--sw-ui-focus))]", (disabled || full || uploading) && "pointer-events-none") })}
        >
          {uploading ? "Uploading" : "Add a logo variant"}
        </label>
        <input
          id={inputId}
          type="file"
          className="sr-only"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled || full || uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onUpload(file);
          }}
        />
        <span className="text-caption text-ink-muted">JPEG, PNG or WebP · up to 5 MB</span>
      </div>
    </section>
  );
}
