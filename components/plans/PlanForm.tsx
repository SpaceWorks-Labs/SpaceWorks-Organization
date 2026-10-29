"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createPlan, setPlanArchived, updatePlan } from "@/app/actions/plans";
import { cleanSlug, slugFromName } from "@/components/onboarding/SlugField";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/field";
import { JoiningSection, LengthSection, PriceSection, RenewalSection, UnitsSection } from "./PlanFormSections";
import { JoinFormSection } from "./PlanJoinFormSection";
import { valuesToPayload, type PlanFormValues } from "./planFormState";

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card as="section" className="rounded-xl">
      <CardHeader title={title} description={description} />
      {children}
    </Card>
  );
}

/**
 * Create or edit a plan. Changes apply to new memberships only: a membership keeps the price and dates it
 * started with.
 */
export function PlanForm({
  slug,
  planId,
  initial,
  units,
  currencyLocked = false,
  archived = false,
  disabled = false,
}: {
  slug: string;
  planId?: string;
  initial: PlanFormValues;
  units: Array<{ id: string; name: string; level: number }>;
  currencyLocked?: boolean;
  archived?: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [slugEdited, setSlugEdited] = useState(Boolean(planId));
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof PlanFormValues>(key: K, value: PlanFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const sectionProps = { values, set, errors, disabled };

  const save = () =>
    startTransition(async () => {
      setStatus(null);
      const payload = { organisationSlug: slug, ...valuesToPayload(values) };
      const result = planId ? await updatePlan({ ...payload, planId }) : await createPlan(payload);
      setErrors(result.ok ? {} : result.fieldErrors ?? {});
      if (!result.ok) {
        setStatus({ ok: false, text: result.error });
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (!planId && result.data && "planId" in result.data) {
        router.push(`/dashboard/${slug}/plans/${result.data.planId}`);
        return;
      }
      setStatus({ ok: true, text: "Plan saved. Changes apply to new memberships." });
      router.refresh();
    });

  const archive = () =>
    startTransition(async () => {
      const result = await setPlanArchived({ organisationSlug: slug, planId, archived: !archived });
      setStatus(result.ok ? { ok: true, text: archived ? "Plan restored." : "Plan archived. Nobody new can join it." } : { ok: false, text: result.error });
      router.refresh();
    });

  return (
    <form className="flex flex-col gap-6" onSubmit={(event) => { event.preventDefault(); save(); }}>
      {status ? <Callout tone={status.ok ? "success" : "danger"} role={status.ok ? "status" : "alert"}>{status.text}</Callout> : null}
      {disabled ? <Callout tone="info">Only owners and organisation-wide managers can change plans.</Callout> : null}

      <Section title="About this plan">
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Plan name" required error={errors.name?.[0]}>
              <Input
                value={values.name}
                disabled={disabled}
                maxLength={80}
                placeholder="Annual membership"
                onChange={(event) => {
                  set("name", event.target.value);
                  if (!slugEdited) set("slug", slugFromName(event.target.value));
                }}
              />
            </Field>
            <Field label="Short address" required helperText={`Join link: /o/${slug}/join/${values.slug || "…"}`} error={errors.slug?.[0]}>
              <Input value={values.slug} disabled={disabled} maxLength={64} onChange={(event) => { setSlugEdited(true); set("slug", cleanSlug(event.target.value)); }} />
            </Field>
          </div>
          <Field label="Description" optional helperText="Shown on your public page and join form." error={errors.description?.[0]}>
            <Textarea value={values.description} disabled={disabled} rows={3} maxLength={2000} onChange={(event) => set("description", event.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title="Price" description="Amounts are stored exactly, in the plan's currency.">
        <PriceSection {...sectionProps} currencyLocked={currencyLocked} />
      </Section>
      <Section title="How long it lasts">
        <LengthSection {...sectionProps} />
      </Section>
      <Section title="How people join">
        <JoiningSection {...sectionProps} />
      </Section>
      <Section title="Join form" description="Name and email always come from the person's account.">
        <JoinFormSection {...sectionProps} />
      </Section>
      <Section title="Renewals" description="Members are reminded by email, once at each point.">
        <RenewalSection {...sectionProps} />
      </Section>
      <Section title="Units">
        <UnitsSection {...sectionProps} units={units} />
      </Section>

      {!disabled ? (
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
          <Button type="submit" variant="primary" loading={pending}>{planId ? "Save plan" : "Create plan"}</Button>
          {planId ? (
            <Button type="button" variant={archived ? "secondary" : "dangerQuiet"} className="ml-auto" disabled={pending} onClick={archive}>
              {archived ? "Restore plan" : "Archive plan"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
