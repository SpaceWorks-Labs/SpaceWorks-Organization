"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setUnitContact } from "@/app/actions/unit-contact";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { checkUnitContact, type UnitContactErrors, type UnitContactInput } from "@/lib/units/contactInput";

type Inherited = { email: string | null; phone: string | null; website: string | null };
type Key = keyof UnitContactInput;

const FIELDS: { key: Key; inherited: keyof Inherited; label: string; type: string; autoComplete: string; inputMode?: "email" | "tel" | "url"; example: string }[] = [
  { key: "contactEmail", inherited: "email", label: "Email", type: "email", autoComplete: "email", inputMode: "email", example: "name@example.org" },
  { key: "contactPhone", inherited: "phone", label: "Phone", type: "tel", autoComplete: "tel", inputMode: "tel", example: "+91 90000 00000" },
  { key: "website", inherited: "website", label: "Website", type: "url", autoComplete: "url", inputMode: "url", example: "https://example.org" },
];

/**
 * An area's own contact details, printed on its members' card backs. A detail left empty uses the nearest unit
 * above's, then the organisation's (`inherited`, shown as the placeholder and hint). Checked in the browser with the
 * same rules as the server, errors under each field and focus on the first one; a toast confirms the save.
 */
export function UnitContactForm({ slug, unitId, initial, inherited, canEdit }: {
  slug: string; unitId: string; initial: { email: string; phone: string; website: string }; inherited: Inherited; canEdit: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const start = { contactEmail: initial.email, contactPhone: initial.phone, website: initial.website };
  const [saved, setSaved] = useState<UnitContactInput>(start);
  const [values, setValues] = useState<UnitContactInput>(start);
  const [errors, setErrors] = useState<UnitContactErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputs = useRef<Partial<Record<Key, HTMLInputElement | null>>>({});
  const changed = FIELDS.some(({ key }) => values[key].trim() !== saved[key].trim());

  const showErrors = (next: UnitContactErrors) => {
    setErrors(next);
    const first = FIELDS.find(({ key }) => next[key]);
    if (first) inputs.current[first.key]?.focus();
  };

  const submit = () => {
    setFormError(null);
    const checked = checkUnitContact(values);
    if (!checked.ok) return showErrors(checked.errors);
    setErrors({});
    startTransition(async () => {
      const result = await setUnitContact({ organisationSlug: slug, unitId, ...values });
      if (!result.ok) {
        const fieldErrors = Object.fromEntries(Object.entries(result.fieldErrors ?? {}).map(([key, messages]) => [key, messages?.[0]])) as UnitContactErrors;
        if (Object.keys(fieldErrors).length) showErrors(fieldErrors);
        else setFormError(result.error);
        return;
      }
      const stored = { contactEmail: result.data?.contactEmail ?? "", contactPhone: result.data?.contactPhone ?? "", website: result.data?.website ?? "" };
      setSaved(stored);
      setValues(stored);
      showToast("Contact details saved", "success");
      // The button disables while saving and stays disabled until the next change, so focus goes back to the form.
      inputs.current.contactEmail?.focus();
      router.refresh();
    });
  };

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
      {formError ? <Callout tone="danger" role="alert">{formError}</Callout> : null}
      {FIELDS.map((field) => {
        const fallback = inherited[field.inherited];
        return (
          <Field
            key={field.key}
            label={field.label}
            optional
            error={errors[field.key]}
            helperText={fallback ? `Leave empty to use ${fallback}.` : "Leave empty to print none."}
          >
            <Input
              ref={(node) => { inputs.current[field.key] = node; }}
              type={field.type}
              inputMode={field.inputMode}
              autoComplete={field.autoComplete}
              spellCheck={false}
              value={values[field.key]}
              disabled={!canEdit}
              placeholder={fallback ?? field.example}
              maxLength={field.key === "contactPhone" ? 20 : field.key === "website" ? 200 : 254}
              onChange={(event) => {
                setValues((current) => ({ ...current, [field.key]: event.target.value }));
                if (errors[field.key]) setErrors((current) => ({ ...current, [field.key]: undefined }));
              }}
            />
          </Field>
        );
      })}
      {canEdit ? (
        <div>
          <Button type="submit" variant="secondary" loading={pending} disabled={!changed}>Save contact details</Button>
        </div>
      ) : null}
    </form>
  );
}
