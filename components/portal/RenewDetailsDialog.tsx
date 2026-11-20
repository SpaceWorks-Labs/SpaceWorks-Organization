"use client";

import { useState, useTransition } from "react";
import { renewMembership } from "@/app/actions/portal";
import { PlanAnswerFields, type AnswerState } from "@/components/members/PlanAnswerFields";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import type { ProfilePlan } from "@/lib/membership/profileQuestions";

export type RenewAsks = { photo: boolean; questions: ProfilePlan | null; answers: AnswerState };

/** What a plan asks again at renewal: the join-form answers and a current photo. Shown before the renewal starts. */
export function RenewDetailsDialog({ open, onClose, organisationSlug, planId, planName, asks, onRenewed }: {
  open: boolean; onClose: () => void; organisationSlug: string; planId: string; planName: string; asks: RenewAsks; onRenewed: (status: string | undefined) => void;
}) {
  const [answers, setAnswers] = useState<AnswerState>(asks.answers);
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => startTransition(async () => {
    const form = new FormData();
    form.set("organisationSlug", organisationSlug);
    form.set("planId", planId);
    if (asks.questions) form.set("answers", JSON.stringify(answers));
    if (photo) form.set("photo", photo);
    const result = await renewMembership(form);
    if (!result.ok) return setError(result.error);
    onRenewed(result.data?.status);
  });

  return (
    <Dialog open={open} onOpenChange={(next) => (next || pending ? null : onClose())}>
      <DialogContent size="md">
        <DialogHeader title={`Renew ${planName}`} description="Check your details before you renew." />
        <DialogBody>
          <form id="renew-details" className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); submit(); }}>
            {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
            {asks.questions ? <PlanAnswerFields plans={[asks.questions]} values={answers} errors={{}} byManager={false} onAnswer={(key, value) => setAnswers((current) => ({ ...current, [key]: value }))} /> : null}
            {asks.photo ? (
              <Field label="A current photo" required helperText="A clear photo of your face. It replaces the one on your card.">
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} className="block w-full text-[14px] text-ink-secondary file:mr-3 file:min-h-11 file:rounded-control file:border file:border-line file:bg-panel file:px-4 file:font-semibold file:text-ink hover:file:bg-muted" />
              </Field>
            ) : null}
          </form>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" disabled={pending} onClick={onClose}>Not now</Button>
          <Button type="submit" form="renew-details" variant="primary" loading={pending}>Renew membership</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
