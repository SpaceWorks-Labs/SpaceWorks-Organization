"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { discardPublicPageDraft, publishPublicPage, savePublicPageDraft, unpublishPublicPage } from "@/app/actions/public-page";
import { useToast } from "@/components/feedback/ToastProvider";
import { useUnsavedChangesGuard } from "@/components/forms/useUnsavedChangesGuard";
import type { PageOrg, PageUnit } from "@/components/public/PageSections";
import type { PublicPlan } from "@/components/public/PlanCards";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader, Chip } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DEFAULT_ORG_ACCENT } from "@/lib/theme/accent";
import type { PublicCounts, SampleCard } from "@/lib/publicPage/live";
import type { PageDocument } from "@/lib/publicPage/sections";
import { PageDetailsFields } from "./PageDetailsFields";
import { PreviewPane } from "./PreviewPane";
import { SectionList } from "./SectionList";
import { TemplatePicker } from "./TemplateDialog";

type Props = {
  org: PageOrg & { slug: string; description: string; accentColor: string | null; status: string; contactEmail: string | null; contactPhone: string | null };
  initial: PageDocument;
  publishedLabel: string | null;
  hasDraft: boolean;
  canEdit: boolean;
  plans: PublicPlan[];
  units: PageUnit[];
  counts: PublicCounts | null;
  sampleCard: SampleCard | null;
};

/**
 * The public page editor: page details and sections on the left, a live preview on the right. Saving a
 * draft changes nothing visitors see; publishing replaces the live page.
 */
export function PageEditor({ org, initial, publishedLabel, hasDraft, canEdit, plans, units, counts, sampleCard }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [document, setDocument] = useState(initial);
  const [saved, setSaved] = useState(() => JSON.stringify(initial));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [confirm, setConfirm] = useState<"publish" | "discard" | "unpublish" | null>(null);
  const [busy, startTransition] = useTransition();
  const dirty = useMemo(() => JSON.stringify(document) !== saved, [document, saved]);
  useUnsavedChangesGuard(dirty && canEdit);
  const disabled = !canEdit || busy;
  const fallbackAccent = org.accentColor ?? DEFAULT_ORG_ACCENT;
  const planChoices = useMemo(() => plans.map((plan) => ({ slug: plan.slug, name: plan.name })), [plans]);
  const sectionErrors = Object.keys(errors).filter((key) => key.startsWith("sections.")).length;

  const submit = (kind: "draft" | "publish") => startTransition(async () => {
    const action = kind === "draft" ? savePublicPageDraft : publishPublicPage;
    const result = await action({ organisationSlug: org.slug, document });
    setConfirm(null);
    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      return showToast(result.error, "error");
    }
    setErrors({});
    setSaved(JSON.stringify(document));
    showToast(kind === "draft" ? "Draft saved. Visitors still see the published page." : "Published. Your page is live.", "success");
    router.refresh();
  });

  // The page remounts this editor with the server's document after a discard or unpublish (its key).
  const simple = (work: () => Promise<{ ok: boolean; error?: string }>, done: string) => startTransition(async () => {
    const result = await work();
    setConfirm(null);
    showToast(result.ok ? done : result.error ?? "Couldn't do that.", result.ok ? "success" : "error");
    if (result.ok) router.refresh();
  });
  const discard = () => {
    setDocument(initial);
    setErrors({});
    if (hasDraft) return simple(() => discardPublicPageDraft({ organisationSlug: org.slug }), "Changes discarded.");
    setConfirm(null);
    showToast("Changes discarded.", "success");
  };
  const applyTemplate = (next: PageDocument, label: string) => {
    setDocument(next);
    setErrors({});
    showToast(`${label} template applied. Save a draft or publish when it's ready.`, "success");
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        {publishedLabel ? <Chip tone="success">Published {publishedLabel}</Chip> : <Chip tone="neutral">Not published: visitors see the plain page</Chip>}
        {dirty ? <Chip tone="warning">Unsaved changes</Chip> : hasDraft ? <Chip tone="info">Unpublished draft</Chip> : null}
        <Link href={`/o/${org.slug}`} target="_blank" rel="noopener" className="ml-auto inline-flex min-h-11 items-center gap-1 text-label text-ink-secondary underline-offset-4 hover:text-ink hover:underline">
          Open the live page
          <ArrowUpRight aria-hidden className="size-4" />
          <span className="sr-only"> (opens in a new tab)</span>
        </Link>
      </div>
      {!canEdit ? <Callout tone="info">Only organisation-wide owners and managers can edit the public page.</Callout> : null}
      {sectionErrors ? <Callout tone="danger" role="alert">Some sections need attention. They are marked below; open each one to see what to change.</Callout> : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card as="section" className="rounded-xl">
            <CardHeader title="Page details" />
            <PageDetailsFields slug={org.slug} value={document} fallbackAccent={fallbackAccent} disabled={disabled} errors={errors} onChange={(patch) => setDocument((current) => ({ ...current, ...patch }))} />
          </Card>
          <Card as="section" className="rounded-xl">
            <CardHeader
              title="Sections"
              description="Shown top to bottom. Hidden sections stay in your draft."
              action={canEdit ? <TemplatePicker document={document} org={org} disabled={disabled} onApply={applyTemplate} /> : undefined}
            />
            <SectionList slug={org.slug} sections={document.sections} plans={planChoices} disabled={disabled} errors={errors} contact={org} onChange={(sections) => setDocument((current) => ({ ...current, sections }))} />
          </Card>
        </div>
        <PreviewPane document={document} org={org} plans={plans} units={units} takingMembers={org.status === "ACTIVE"} counts={counts} sampleCard={sampleCard} fallbackAccent={fallbackAccent} />
      </div>

      {canEdit ? (
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-canvas px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:mx-0 sm:rounded-xl sm:border">
          <Button variant="primary" loading={busy && confirm === "publish"} onClick={() => setConfirm("publish")}>Publish</Button>
          <Button variant="secondary" loading={busy && confirm === null} disabled={!dirty} onClick={() => submit("draft")}>Save draft</Button>
          {hasDraft || dirty ? <Button variant="ghost" onClick={() => setConfirm("discard")}>Discard changes</Button> : null}
          {publishedLabel ? <Button variant="dangerQuiet" className="ml-auto" onClick={() => setConfirm("unpublish")}>Unpublish</Button> : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirm === "publish"}
        title="Publish this page?"
        message="Visitors to your public page see it straight away."
        confirmLabel="Publish"
        destructive={false}
        loading={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => submit("publish")}
      />
      <ConfirmDialog
        open={confirm === "discard"}
        title="Discard your changes?"
        message={publishedLabel ? "The editor goes back to the published page." : "The editor goes back to where you last published, or to a fresh start."}
        confirmLabel="Discard changes"
        loading={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={discard}
      />
      <ConfirmDialog
        open={confirm === "unpublish"}
        title="Unpublish the page?"
        message="Visitors see the plain page with your plans and join buttons. Your content stays here as a draft."
        confirmLabel="Unpublish"
        loading={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => simple(() => unpublishPublicPage({ organisationSlug: org.slug }), "Unpublished. Your content is kept as a draft.")}
      />
    </div>
  );
}
