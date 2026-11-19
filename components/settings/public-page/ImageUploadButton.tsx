"use client";

import { useId, useRef, useState, useTransition } from "react";
import { ImagePlus } from "lucide-react";
import { uploadPublicPageImage } from "@/app/actions/public-page";
import { buttonClasses } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";

const TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Upload one image through the storage pipeline (re-encoded, metadata stripped) and hand back its key. */
export function ImageUploadButton({ slug, label, disabled, onUploaded }: { slug: string; label: string; disabled?: boolean; onUploaded: (key: string) => void }) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const choose = (file: File | undefined) => {
    if (!file) return;
    if (!TYPES.includes(file.type)) return setError("Choose a JPEG, PNG or WebP image.");
    if (file.size === 0 || file.size > 5 * 1024 * 1024) return setError("Choose an image that is 5 MB or smaller.");
    setError(null);
    startTransition(async () => {
      const data = new FormData();
      data.set("organisationSlug", slug);
      data.set("file", file);
      const result = await uploadPublicPageImage(data);
      if (input.current) input.current.value = "";
      if (!result.ok || !result.data) return setError(result.ok ? "Could not upload the image." : result.error);
      onUploaded(result.data.key);
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} aria-disabled={disabled || busy ? true : undefined} className={buttonClasses({ variant: "secondary", size: "sm", className: cn("w-fit focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2", disabled || busy ? "pointer-events-none cursor-not-allowed border-line bg-surface text-ink-muted" : "cursor-pointer") })}>
        {busy ? <Spinner className="size-4" /> : <ImagePlus aria-hidden className="size-4" />}
        {busy ? "Uploading…" : label}
        <input ref={input} id={inputId} type="file" accept={TYPES.join(",")} className="sr-only" disabled={disabled || busy} onChange={(event) => choose(event.target.files?.[0])} />
      </label>
      {error ? <p role="alert" className="text-caption text-danger-fg">{error}</p> : null}
    </div>
  );
}
