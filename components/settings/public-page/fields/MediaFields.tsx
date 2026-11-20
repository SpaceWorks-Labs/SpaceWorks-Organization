"use client";

import { CheckCircle2, FileText, Trash2 } from "lucide-react";
import { videoEmbed } from "@/lib/publicPage/embeds";
import { MAX_DOWNLOADS, MAX_GALLERY_IMAGES, isPageFileKey, pageImageUrl } from "@/lib/publicPage/sections";
import { IconButton } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { FileUploadButton } from "../FileUploadButton";
import { ImageUploadButton } from "../ImageUploadButton";
import { ActionFields } from "./ActionFields";
import { ChoiceCards, ImageField, type SectionProps } from "./shared";

const SIDES = [
  { value: "left", label: "Image left" },
  { value: "right", label: "Image right" },
] as const;

const MARKDOWN_HELP = "Markdown: ## heading, **bold**, *italic*, - lists, [link](https://…). HTML isn't allowed.";

/** A photo beside a block of text, with an optional button. */
export function ImageTextFields({ section, slug, plans, disabled, error, onChange }: SectionProps<"imageText">) {
  return (
    <div className="flex flex-col gap-4">
      <ImageField slug={slug} label="Image" imageKey={section.imageKey} alt={section.imageAlt} disabled={disabled} error={error("imageKey")} onChange={(next) => onChange({ ...section, imageKey: next.imageKey, imageAlt: next.alt ?? section.imageAlt })} />
      <ChoiceCards label="Image side" value={section.side} options={SIDES} disabled={disabled} onChange={(side) => onChange({ ...section, side })} />
      <Field label="Text" helperText={MARKDOWN_HELP} error={error("markdown")}>
        <Textarea value={section.markdown} rows={6} maxLength={3000} disabled={disabled} onChange={(event) => onChange({ ...section, markdown: event.target.value })} />
      </Field>
      <ActionFields legend="Button" value={section.primary} plans={plans} disabled={disabled} error={(path) => error(`primary.${path}`)} onChange={(primary) => onChange({ ...section, primary })} />
    </div>
  );
}

/** A YouTube or Vimeo video, checked as it is typed. */
export function VideoFields({ section, disabled, error, onChange }: SectionProps<"video">) {
  const embed = section.url ? videoEmbed(section.url) : null;
  const local = section.url && !embed ? "Use a YouTube or Vimeo link, like https://www.youtube.com/watch?v=… or https://vimeo.com/…" : undefined;
  return (
    <div className="flex flex-col gap-4">
      <Field
        label="Video link"
        helperText="YouTube or Vimeo only. It loads only when a visitor presses play, through YouTube's privacy-enhanced mode (or Vimeo without tracking)."
        error={error("url") ?? local}
      >
        <Input type="url" inputMode="url" value={section.url} maxLength={500} placeholder="https://www.youtube.com/watch?v=…" disabled={disabled} onChange={(event) => onChange({ ...section, url: event.target.value.trim() })} />
      </Field>
      {embed ? (
        <p role="status" className="flex items-center gap-2 text-caption text-success-fg">
          <CheckCircle2 aria-hidden className="size-4 shrink-0" />
          {embed.provider === "youtube" ? "YouTube" : "Vimeo"} video found.
        </p>
      ) : null}
      <Field label="Caption" optional error={error("caption")}>
        <Input value={section.caption} maxLength={200} disabled={disabled} onChange={(event) => onChange({ ...section, caption: event.target.value })} />
      </Field>
    </div>
  );
}

/** Up to 12 photos, each with a description. */
export function GalleryFields({ section, slug, disabled, error, onChange }: SectionProps<"gallery">) {
  const images = section.images;
  return (
    <div className="flex flex-col gap-4">
      {images.length ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {images.map((image, index) => (
            <li key={image.key} className="flex flex-col gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- uploaded through the app's own storage route */}
              <img src={pageImageUrl(image.key)} alt="" className="aspect-[4/3] w-full rounded-xl border border-line object-cover" />
              <div className="flex items-end gap-2">
                <Field label="Describe the image" helperText="For people using screen readers." className="flex-1" error={error(`images.${index}.alt`)}>
                  <Input value={image.alt} maxLength={160} disabled={disabled} onChange={(event) => onChange({ ...section, images: images.map((other, i) => (i === index ? { ...other, alt: event.target.value } : other)) })} />
                </Field>
                <IconButton label={`Remove image ${index + 1}`} variant="danger" disabled={disabled} onClick={() => onChange({ ...section, images: images.filter((_, i) => i !== index) })}><Trash2 /></IconButton>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="text-body-ui text-ink-muted">No images yet.</p>}
      {images.length < MAX_GALLERY_IMAGES ? (
        <ImageUploadButton slug={slug} label="Add an image" disabled={disabled} onUploaded={(key) => onChange({ ...section, images: [...images, { key, alt: "" }] })} />
      ) : <p className="text-caption text-ink-muted">The gallery holds {MAX_GALLERY_IMAGES} images. Remove one to add another.</p>}
    </div>
  );
}

/** Images and PDFs people can download (a poster, a brochure, a form), each with a name. */
export function DownloadsFields({ section, slug, disabled, error, onChange }: SectionProps<"downloads">) {
  const files = section.files;
  return (
    <div className="flex flex-col gap-4">
      <Field label="Introduction" optional error={error("intro")}>
        <Textarea value={section.intro} rows={2} maxLength={600} disabled={disabled} onChange={(event) => onChange({ ...section, intro: event.target.value })} />
      </Field>
      {files.length ? (
        <ul className="flex flex-col gap-3">
          {files.map((file, index) => (
            <li key={file.key} className="flex items-end gap-3 rounded-xl border border-line p-3">
              {isPageFileKey(file.key) ? (
                <span aria-hidden className="flex size-16 shrink-0 items-center justify-center rounded-md border border-line bg-muted text-ink-muted"><FileText className="size-6" /></span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- uploaded through the app's own storage route
                <img src={pageImageUrl(file.key)} alt="" className="size-16 shrink-0 rounded-md border border-line object-cover" />
              )}
              <Field label="File name" className="min-w-0 flex-1" error={error(`files.${index}.label`)}>
                <Input value={file.label} maxLength={80} placeholder="Membership poster" disabled={disabled} onChange={(event) => onChange({ ...section, files: files.map((other, i) => (i === index ? { ...other, label: event.target.value } : other)) })} />
              </Field>
              <IconButton label={`Remove file ${index + 1}`} variant="danger" disabled={disabled} onClick={() => onChange({ ...section, files: files.filter((_, i) => i !== index) })}><Trash2 /></IconButton>
            </li>
          ))}
        </ul>
      ) : <p className="text-body-ui text-ink-muted">No files yet.</p>}
      <p className="text-caption text-ink-muted">Images (JPEG, PNG or WebP, saved as WebP with their metadata removed) or PDFs, each up to 5 MB.</p>
      {files.length < MAX_DOWNLOADS ? (
        <div className="flex flex-wrap gap-3">
          <ImageUploadButton slug={slug} label="Add an image" disabled={disabled} onUploaded={(key) => onChange({ ...section, files: [...files, { key, label: "" }] })} />
          <FileUploadButton slug={slug} label="Add a PDF" disabled={disabled} onUploaded={(key, name) => onChange({ ...section, files: [...files, { key, label: name }] })} />
        </div>
      ) : <p className="text-caption text-ink-muted">This section holds {MAX_DOWNLOADS} files. Remove one to add another.</p>}
    </div>
  );
}
