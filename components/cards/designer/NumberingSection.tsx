"use client";

import { Field, Input } from "@/components/ui/field";
import { formatCardNumberFrom, normalizeNumberFormat, numberFormatError } from "@/lib/cards/numbering";

export type Numbering = { prefix: string; format: string };

const TOKENS = ["{PREFIX}", "{SEQ:4}", "{MEMBER:4}", "{YYYY}", "{YY}"] as const;

/**
 * The card number prefix and pattern for the organisation default or a member role. The preview uses
 * the running number 42 and member number 7.
 */
export function NumberingSection({ value, onChange, role }: { value: Numbering; onChange: (next: Numbering) => void; role: boolean }) {
  const error = numberFormatError(value.format);
  const prefixError = /^[A-Z0-9]{2,6}$/.test(value.prefix) ? null : "Use 2 to 6 capital letters or digits. The prefix isn't saved until then.";
  const example = error ? "" : formatCardNumberFrom(normalizeNumberFormat(value.format), { prefix: value.prefix || "M", seq: 42, memberNumber: 7, year: new Date().getFullYear() });
  return (
    <div className="flex flex-col gap-3">
      <Field label="Card number prefix" error={prefixError ?? undefined} helperText={role ? "New cards for members with this primary role use this prefix and pattern." : "New cards use this prefix and pattern, unless the member's role has its own."}>
        <Input value={value.prefix} maxLength={6} onChange={(event) => onChange({ ...value, prefix: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} className="w-[10rem] uppercase tabular-nums" />
      </Field>
      <Field label="Card number pattern" error={error ? `${error} The pattern isn't saved until then.` : undefined} helperText={error ? undefined : `For example ${example}. A renewal, a reissue or a new role keeps the number; a new registration gets a new one.`}>
        <Input value={value.format} maxLength={40} spellCheck={false} onChange={(event) => onChange({ ...value, format: event.target.value.toUpperCase() })} className="font-mono uppercase" />
      </Field>
      <div className="flex flex-wrap gap-1.5" aria-label="Insert into the pattern">
        {TOKENS.map((token) => (
          <button key={token} type="button" onClick={() => onChange({ ...value, format: `${value.format}${token}`.slice(0, 40) })} className="rounded-full border border-line bg-panel px-2.5 py-1 font-mono text-caption text-ink hover:bg-muted">
            {token}
          </button>
        ))}
      </div>
    </div>
  );
}
