"use client";

import { useId, useRef, useState } from "react";
import { ImageIcon } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { cn } from "@/lib/cn";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function ImageUploadPicker(props: {
  initialUrl?: string | null;
  label: string;
  placeholder: string;
  disabled?: boolean;
  objectFit?: "contain" | "cover";
  /** A form's error for this picker: marks the file input invalid and links the error text by id. */
  invalid?: boolean;
  describedBy?: string;
  onChange: (file: File | null, previewUrl: string) => void;
}) {
  const {
    initialUrl = "",
    label,
    placeholder,
    disabled = false,
    objectFit = "contain",
    invalid,
    describedBy,
    onChange,
  } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [previewUrl, setPreviewUrl] = useState(initialUrl ?? "");
  const [error, setError] = useState<string | null>(null);

  function choose(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
      setError("Choose an image that is 5 MB or smaller.");
      return;
    }
    setError(null);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    onChange(file, url);
  }

  return (
    <div className="flex flex-col gap-2.5">
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <div className="flex flex-col gap-4 rounded-lg border-[1.5px] border-dashed border-line-strong bg-panel p-4 sm:flex-row sm:items-center">
        <div className="flex h-[112px] w-[144px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted p-1">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URLs and managed uploads
            <img
              src={previewUrl}
              alt={`${label} preview`}
              className={cn("size-full rounded-sm", objectFit === "cover" ? "object-cover" : "object-contain")}
            />
          ) : (
            <span className="flex flex-col items-center gap-1 px-2 text-center">
              <ImageIcon aria-hidden className="size-6 text-ink-muted" />
              <span className="text-caption text-ink-muted">{placeholder}</span>
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor={inputId}
              className={buttonClasses({ variant: "secondary", size: "sm", className: cn("cursor-pointer has-[+input:focus-visible]:outline-2 has-[+input:focus-visible]:outline-offset-2 has-[+input:focus-visible]:outline-[rgb(var(--sw-ui-focus))]", disabled && "pointer-events-none") })}
              aria-disabled={disabled || undefined}
            >
              {previewUrl ? "Replace image" : `Choose ${label.toLowerCase()}`}
            </label>
            <input
              ref={inputRef}
              id={inputId}
              className="sr-only"
              type="file"
              disabled={disabled}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => choose(event.target.files?.[0])}
            />
            {previewUrl ? (
              <Button
                size="sm"
                variant="quiet"
                disabled={disabled}
                onClick={() => {
                  setPreviewUrl("");
                  onChange(null, "");
                }}
              >
                Remove
              </Button>
            ) : null}
          </div>
          <p className="text-caption text-ink-muted">JPEG, PNG, or WebP · up to 5 MB</p>
        </div>
      </div>
    </div>
  );
}
