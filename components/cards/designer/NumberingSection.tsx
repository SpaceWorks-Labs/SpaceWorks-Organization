"use client";

import { Field, Input } from "@/components/ui/field";
import { formatCardNumberFrom, normalizeNumberFormat, numberFormatError } from "@/lib/cards/numbering";
import { sampleNumberUnits } from "./sample";

export type Numbering = { prefix: string; format: string };
/** Whose numbers these are: the organisation default, a member role's own or an area's own. */
export type NumberingScope = "organisation" | "role" | "area";

const PREFIX_HELP: Record<NumberingScope, string> = {
  organisation: "New cards use this prefix and pattern, unless the member's role or area has its own.",
  role: "New cards for members with this primary role use this prefix and pattern.",
  area: "New cards for members in this area, and in the areas under it without their own, use this prefix and pattern, unless their role has its own.",
};

const TOKENS = ["{PREFIX}", "{SEQ:4}", "{MEMBER:4}", "{YYYY}", "{YY}", "{UNIT}", "{U1}", "{U2}"] as const;

/**
 * The card number prefix and pattern for the organisation default, a member role or an area. The preview uses
 * the running number 42, member number 7 and the sample member's unit codes.
 */
export function NumberingSection({ value, onChange, scope, unitLevels }: { value: Numbering; onChange: (next: Numbering) => void; scope: NumberingScope; unitLevels?: readonly string[] }) {
  const error = numberFormatError(value.format);
  const prefixError = /^[A-Z0-9]{2,6}$/.test(value.prefix) ? null : "Use 2 to 6 capital letters or digits. The prefix isn't saved until then.";
  const example = error ? "" : formatCardNumberFrom(normalizeNumberFormat(value.format), { prefix: value.prefix || "M", seq: 42, memberNumber: 7, year: new Date().getFullYear(), ...sampleNumberUnits(unitLevels) });
  return (
    <div className="flex flex-col gap-3">
      {scope === "area" ? <p className="text-caption text-ink-secondary">Each area keeps its own running series. Card numbers already given never change.</p> : null}
      <Field label="Card number prefix" error={prefixError ?? undefined} helperText={PREFIX_HELP[scope]}>
        <Input value={value.prefix} maxLength={6} onChange={(event) => onChange({ ...value, prefix: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} className="w-[10rem] uppercase tabular-nums" />
      </Field>
      <Field label="Card number pattern" error={error ? `${error} The pattern isn't saved until then.` : undefined} helperText={error ? undefined : `For example ${example}. A renewal, a reissue or a new role keeps the number; a new registration gets a new one.`}>
        <Input value={value.format} maxLength={40} spellCheck={false} onChange={(event) => onChange({ ...value, format: event.target.value.toUpperCase() })} className="code-text uppercase" />
      </Field>
      <div className="flex flex-wrap gap-1.5" aria-label="Insert into the pattern">
        {TOKENS.map((token) => (
          <button key={token} type="button" onClick={() => onChange({ ...value, format: `${value.format}${token}`.slice(0, 40) })} className="rounded-full border border-line bg-panel px-2.5 py-1 code-text text-caption text-ink hover:bg-muted">
            {token}
          </button>
        ))}
      </div>
      <p className="text-caption text-ink-muted">{"{UNIT} is the member's unit code and {U1} to {U4} the code at each level, {U1} being the top. A member without one gets NA. The codes are fixed when the number is given, so a later move keeps the number."}</p>
    </div>
  );
}
