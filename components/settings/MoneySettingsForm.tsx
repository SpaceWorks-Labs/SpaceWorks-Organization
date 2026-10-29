"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOrganisationPreferences } from "@/app/actions/structure";
import { CURRENCIES, CURRENCY_CODES, formatMoney, type CurrencyCode } from "@/lib/money/currencies";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { Dropdown, Field, Input } from "@/components/ui/field";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type MoneyValues = { currency: string; locale: string; timezone: string; financialYearStartMonth: number; offlineConfirmationRequired: boolean };

/** Default currency, number style, financial year and timezone, plus the offline maker-checker switch. */
export function MoneySettingsForm({ slug, initial, calendarLocked, timezones, disabled }: { slug: string; initial: MoneyValues; calendarLocked: boolean; timezones: string[]; disabled: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();
  const preview = useMemo(() => {
    try {
      const code = values.currency as CurrencyCode;
      return formatMoney(1_234_567 * 10 ** CURRENCIES[code].exponent, code, values.locale || undefined);
    } catch {
      return "—";
    }
  }, [values.currency, values.locale]);

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        setStatus(null);
        startTransition(async () => {
          const result = await updateOrganisationPreferences({ organisationSlug: slug, ...values });
          setErrors(result.ok ? {} : result.fieldErrors ?? {});
          setStatus(result.ok ? { ok: true, text: "Saved." } : { ok: false, text: result.error });
          if (result.ok) router.refresh();
        });
      }}
    >
      {status ? <Callout tone={status.ok ? "success" : "danger"} role={status.ok ? "status" : "alert"}>{status.text}</Callout> : null}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Default currency" helperText="New plans start in this currency. Each plan can use its own." error={errors.currency?.[0]}>
          <Dropdown value={values.currency} disabled={disabled} onChange={(event) => setValues({ ...values, currency: event.target.value })}>
            {CURRENCY_CODES.map((code) => <option key={code} value={code}>{`${code} · ${CURRENCIES[code].name}`}</option>)}
          </Dropdown>
        </Field>
        <Field label="Number style" optional helperText={`Shows as ${preview}`} error={errors.locale?.[0]}>
          <Input value={values.locale} disabled={disabled} placeholder="Automatic" onChange={(event) => setValues({ ...values, locale: event.target.value })} maxLength={20} />
        </Field>
        <Field label="Financial year starts in" helperText={calendarLocked ? "Fixed now that memberships exist." : "Membership years and receipt numbers follow this year."}>
          <Dropdown value={String(values.financialYearStartMonth)} disabled={disabled || calendarLocked} onChange={(event) => setValues({ ...values, financialYearStartMonth: Number(event.target.value) })}>
            {MONTHS.map((month, index) => <option key={month} value={String(index + 1)}>{month}</option>)}
          </Dropdown>
        </Field>
        <Field label="Timezone" helperText={calendarLocked ? "Fixed now that memberships exist." : "Days start and end at midnight here."} error={errors.timezone?.[0]}>
          <Dropdown value={values.timezone} disabled={disabled || calendarLocked} onChange={(event) => setValues({ ...values, timezone: event.target.value })}>
            {timezones.map((zone) => <option key={zone} value={zone}>{zone.replace(/_/g, " ")}</option>)}
          </Dropdown>
        </Field>
      </div>
      <CheckboxField
        checked={values.offlineConfirmationRequired}
        disabled={disabled}
        onCheckedChange={(checked) => setValues({ ...values, offlineConfirmationRequired: checked === true })}
        label="A second person confirms offline payments"
        description="Cash, UPI and bank transfers recorded by one team member count only after another owner, manager or treasurer confirms them."
      />
      {!disabled ? (
        <div>
          <Button type="submit" variant="primary" loading={pending}>Save</Button>
        </div>
      ) : null}
    </form>
  );
}
