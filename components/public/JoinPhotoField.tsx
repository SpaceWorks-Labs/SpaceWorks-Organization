"use client";

import { ImageUploadPicker } from "@/components/forms/ImageUploadPicker";

/**
 * The photo for the member's card, when the plan asks for one. Someone who already has a photo keeps it: an
 * optional photo isn't asked for again, and a required one is met by the photo on record.
 */
export function JoinPhotoField({ mode, hasPhoto, error, onChange }: { mode: "OFF" | "OPTIONAL" | "REQUIRED"; hasPhoto: boolean; error?: string; onChange: (file: File | null) => void }) {
  if (mode === "OFF" || (hasPhoto && mode === "OPTIONAL")) return null;
  if (hasPhoto) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-label text-ink">Photo</p>
        <p className="text-body-ui text-ink-secondary">We&apos;ll keep the photo the organisation already has for you.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-label text-ink">
        Photo
        {mode === "OPTIONAL" ? <span className="ml-1.5 font-normal text-ink-muted">Optional</span> : null}
      </p>
      <p className="text-caption text-ink-muted">Printed on your membership card. A clear, front-facing picture of your face works best.</p>
      <ImageUploadPicker label="Photo" placeholder="Your photo" objectFit="cover" onChange={(file) => onChange(file)} />
      {error ? <p role="alert" className="text-caption text-danger-fg">{error}</p> : null}
    </div>
  );
}
