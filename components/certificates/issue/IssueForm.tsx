"use client";

import { useState, useTransition, type FormEvent } from "react";
import { previewCertificateIssue, type CertificateIssuePreview } from "@/app/actions/certificate-batch";
import { issueCertificates, type CertificateRecipientOption, type IssueCertificatesResult } from "@/app/actions/certificates";
import { Button } from "@/components/ui/button";
import { CheckboxField, RadioCard, RadioGroup } from "@/components/ui/choice";
import { Callout, Card } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Dropdown } from "@/components/ui/select";
import { REASON_MAX, TITLE_MAX } from "@/lib/certificates/pages";
import { IssueConfirmDialog } from "./IssueConfirmDialog";
import { IssueResult } from "./IssueResult";
import { MemberPicker } from "./MemberPicker";

type Kind = "members" | "plan" | "group";
type Design = { id: string; name: string; typeLabel: string };

/**
 * Issue certificates: the design, the wording (title, an optional reason or citation), the recipients (chosen
 * members, everyone current on a plan, or a smart group) and whether to email them. "Review" asks the server who
 * that reaches and who would be skipped, then a confirmation issues them and the result replaces the form.
 */
export function IssueForm({ organisationSlug, designs, selectedDesignId, plans, groups, limit, initialMember = null }: {
  organisationSlug: string;
  designs: Design[];
  selectedDesignId: string | null;
  plans: Array<{ id: string; name: string; memberCount: number }>;
  groups: Array<{ id: string; name: string }>;
  limit: number;
  /** Opened from a member's page: that member, already chosen. */
  initialMember?: CertificateRecipientOption | null;
}) {
  const [designId, setDesignId] = useState(selectedDesignId ?? designs[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [kind, setKind] = useState<Kind>("members");
  const [chosen, setChosen] = useState<CertificateRecipientOption[]>(initialMember ? [initialMember] : []);
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [email, setEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CertificateIssuePreview | null>(null);
  const [result, setResult] = useState<{ data: IssueCertificatesResult; emailed: boolean; design: Design } | null>(null);
  const [checking, startChecking] = useTransition();
  const [issuing, startIssuing] = useTransition();
  const design = designs.find((item) => item.id === designId) ?? null;

  const target = () => (kind === "members" ? { kind, memberIds: chosen.map((member) => member.id) } : kind === "plan" ? { kind, planId } : { kind, groupId });
  const ready = Boolean(design) && (kind === "members" ? chosen.length > 0 : kind === "plan" ? Boolean(planId) : Boolean(groupId));
  const request = () => ({ organisationSlug, designId, title: title.trim() || undefined, target: target() });

  const review = (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return setError(kind === "members" ? "Choose at least one member." : kind === "plan" ? "Choose a plan." : "Choose a smart group.");
    startChecking(async () => {
      setError(null);
      const response = await previewCertificateIssue(request());
      if (!response.ok || !response.data) return setError(response.ok ? "The recipients couldn't be checked. Try again." : response.error);
      setPreview(response.data);
    });
  };
  const issue = () => startIssuing(async () => {
    const response = await issueCertificates({ ...request(), reason: reason.trim() || undefined, email });
    setPreview(null);
    if (!response.ok || !response.data) return setError(response.ok ? "The certificates weren't issued. Try again." : response.error);
    setResult({ data: response.data, emailed: email, design: design! });
  });

  if (result) {
    return <IssueResult organisationSlug={organisationSlug} design={result.design} result={result.data} emailed={result.emailed} onAgain={() => { setResult(null); setChosen([]); }} />;
  }

  return (
    <>
      <form onSubmit={review} className="flex flex-col gap-5">
        <Card as="section" aria-labelledby="issue-what" className="flex flex-col gap-4">
          <h2 id="issue-what" className="text-title text-ink">Certificate</h2>
          <Field label="Design">
            <Dropdown value={designId} onChange={(event) => setDesignId(event.target.value)}>
              {designs.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.typeLabel})</option>)}
            </Dropdown>
          </Field>
          <Field label="Title" optional helperText={`Printed as {title}. Left empty, it reads "${design?.typeLabel ?? ""}".`}>
            <Input value={title} maxLength={TITLE_MAX} placeholder={design?.typeLabel} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="Reason or citation" optional helperText={`Printed as {reason}, the same on every certificate in this batch. Up to ${REASON_MAX} characters.`}>
            <Textarea rows={3} value={reason} maxLength={REASON_MAX} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <p className="text-caption text-ink-muted">The date printed as {"{date}"} is the day they are issued, in your organisation&apos;s time zone.</p>
        </Card>

        <Card as="section" aria-labelledby="issue-who" className="flex flex-col gap-4">
          <h2 id="issue-who" className="text-title text-ink">Recipients</h2>
          <RadioGroup value={kind} onValueChange={(value) => { setKind(value as Kind); setError(null); }} aria-label="Who gets it" className="grid gap-2 sm:grid-cols-3">
            <RadioCard value="members" label="Chosen members" description="Search and pick" />
            <RadioCard value="plan" label="A plan" description="Everyone current on it" disabled={!plans.length} />
            <RadioCard value="group" label="A smart group" description="Everyone who matches" disabled={!groups.length} />
          </RadioGroup>
          {kind === "members" ? <MemberPicker organisationSlug={organisationSlug} chosen={chosen} limit={limit} onChange={setChosen} /> : null}
          {kind === "plan" ? (
            <Field label="Plan" helperText="Members whose membership on it is active or in its grace period.">
              <Dropdown value={planId} onChange={(event) => setPlanId(event.target.value)}>
                {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} ({plan.memberCount.toLocaleString("en-IN")} current)</option>)}
              </Dropdown>
            </Field>
          ) : null}
          {kind === "group" ? (
            <Field label="Smart group">
              <Dropdown value={groupId} onChange={(event) => setGroupId(event.target.value)}>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </Dropdown>
            </Field>
          ) : null}
          <p className="text-caption text-ink-muted">One request issues up to {limit} certificates. Members who already hold a valid certificate of this design with this title are skipped.</p>
        </Card>

        <CheckboxField checked={email} onCheckedChange={(value) => setEmail(value === true)} label="Email each member their certificate" description="Each email carries the PDF and the link that checks it." />
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" loading={checking}>{checking ? "Checking recipients…" : "Review and issue"}</Button>
        </div>
      </form>
      <IssueConfirmDialog preview={preview} designName={design?.name ?? ""} title={title.trim() || design?.typeLabel || ""} email={email} busy={issuing} onConfirm={issue} onCancel={() => setPreview(null)} />
    </>
  );
}
