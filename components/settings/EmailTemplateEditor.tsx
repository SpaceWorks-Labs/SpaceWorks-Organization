"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetEmailTemplate, saveEmailTemplate, sendEmailTemplateTest } from "@/app/actions/email-templates";
import { smsSegments } from "@/lib/messages/sms";
import { useFocusFirstError } from "@/components/forms/focusFirstError";
import { useUnsavedChangesGuard } from "@/components/forms/useUnsavedChangesGuard";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { EMAIL_TEMPLATE_LABELS, PLACEHOLDERS, renderEmailTemplate, renderShortText, sampleValues, STANDARD_TEMPLATES, TEMPLATE_LIMITS, templateProblem, type EmailTemplateKind, type MessageTemplate } from "@/lib/email/templates";

/** One member email's wording: subject, heading and text with placeholders, a live preview and a test send. */
export function EmailTemplateEditor({ slug, kind, organisation, saved, canEdit }: { slug: string; kind: EmailTemplateKind; organisation: string; saved: MessageTemplate | null; canEdit: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState<MessageTemplate>(saved ?? STANDARD_TEMPLATES[kind]);
  const [baseline, setBaseline] = useState<MessageTemplate>(saved ?? STANDARD_TEMPLATES[kind]);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const preview = renderEmailTemplate(values, sampleValues(organisation));
  const problem = templateProblem(values);
  const shortPreview = renderShortText(values.short.trim() || STANDARD_TEMPLATES[kind].short, sampleValues(organisation));
  const sms = smsSegments(shortPreview);
  const set = (key: keyof MessageTemplate, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const label = EMAIL_TEMPLATE_LABELS[kind];
  const rootRef = useRef<HTMLElement>(null);
  useFocusFirstError(rootRef, errors);
  useUnsavedChangesGuard(canEdit && !pending && JSON.stringify(values) !== JSON.stringify(baseline));

  const run = (action: () => Promise<{ ok: boolean; error?: string; fieldErrors?: Record<string, string[] | undefined> }>, done: string, refresh = true, nextBaseline?: MessageTemplate) => startTransition(async () => {
    const result = await action();
    if (result.ok && nextBaseline) setBaseline(nextBaseline);
    setErrors(result.ok ? {} : result.fieldErrors ?? {});
    setStatus(result.ok ? { ok: true, text: done } : { ok: false, text: result.error ?? "The template couldn’t be saved. Try again." });
    if (result.ok && refresh) router.refresh();
  });

  return (
    <section ref={rootRef} className="flex flex-col gap-4 border-t border-line pt-5 first:border-t-0 first:pt-0" aria-label={label.title}>
      <div>
        <h3 className="text-h4 text-ink">{label.title}</h3>
        <p className="text-caption text-ink-muted">{label.description} {saved ? "Uses your wording." : "Uses the standard wording."}</p>
      </div>
      {status ? <Callout tone={status.ok ? "success" : "danger"} role={status.ok ? "status" : "alert"}>{status.text}</Callout> : null}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Field label="Subject" error={errors.subject?.[0]}>
            <Input value={values.subject} disabled={!canEdit} maxLength={TEMPLATE_LIMITS.subject} onChange={(event) => set("subject", event.target.value)} />
          </Field>
          <Field label="Heading" error={errors.heading?.[0]}>
            <Input value={values.heading} disabled={!canEdit} maxLength={TEMPLATE_LIMITS.heading} onChange={(event) => set("heading", event.target.value)} />
          </Field>
          <Field label="Text" error={errors.body?.[0]} helperText={`Plain text. Leave a blank line between paragraphs. Placeholders: ${PLACEHOLDERS.map((key) => `{${key}}`).join(" ")}.`}>
            <Textarea rows={8} value={values.body} disabled={!canEdit} maxLength={TEMPLATE_LIMITS.body} onChange={(event) => set("body", event.target.value)} />
          </Field>
          <Field label="Short text" optional error={errors.short?.[0]} helperText={`For text messages and chat apps. Leave empty for the standard short text. ${sms.characters} characters, ${sms.segments} text message ${sms.segments === 1 ? "segment" : "segments"}${sms.unicode ? " (this wording needs the longer character set)" : ""}.`}>
            <Textarea rows={3} value={values.short} disabled={!canEdit} maxLength={TEMPLATE_LIMITS.short} onChange={(event) => set("short", event.target.value)} />
          </Field>
        </div>
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-subtle p-4">
          <p className="text-caption text-ink-muted">Preview, with sample details</p>
          <p className="text-label text-ink">{preview.subject}</p>
          <div className="rounded-md bg-panel p-4">
            <p className="mb-3 text-h4 text-ink">{preview.heading}</p>
            {preview.paragraphs.map((paragraph, index) => <p key={index} className="mb-3 whitespace-pre-line text-body-ui text-ink-secondary last:mb-0">{paragraph}</p>)}
          </div>
          <p className="mt-2 text-caption text-ink-muted">Short text</p>
          <p className="whitespace-pre-line rounded-md bg-panel p-3 text-body-ui text-ink-secondary">{shortPreview}</p>
        </div>
      </div>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" loading={pending} disabled={Boolean(problem)} onClick={() => run(() => saveEmailTemplate({ organisationSlug: slug, kind, ...values }), "Saved. Members get this wording from now on.", true, values)}>Save wording</Button>
          <Button variant="secondary" disabled={pending || Boolean(problem)} onClick={() => run(() => sendEmailTemplateTest({ organisationSlug: slug, kind, ...values }), "Test sent to your email address.", false)}>Send me a test</Button>
          {saved ? <Button variant="ghost" disabled={pending} onClick={() => setConfirming(true)}>Use the standard wording</Button> : null}
          {problem ? <span className="text-caption text-ink-muted">{problem}</span> : null}
        </div>
      ) : null}
      <ConfirmDialog
        open={confirming}
        onCancel={() => setConfirming(false)}
        title="Use the standard wording?"
        message="Your wording for this email is deleted, and members get the standard wording from now on."
        confirmLabel="Use the standard wording"
        destructive={false}
        onConfirm={() => {
          setConfirming(false);
          setValues(STANDARD_TEMPLATES[kind]);
          run(() => resetEmailTemplate({ organisationSlug: slug, kind }), "Back to the standard wording.", true, STANDARD_TEMPLATES[kind]);
        }}
      />
    </section>
  );
}
