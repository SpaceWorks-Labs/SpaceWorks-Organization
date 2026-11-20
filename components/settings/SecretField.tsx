"use client";

import type { ReactNode } from "react";
import { Field, PasswordInput, Textarea } from "@/components/ui/field";

export const SECRET_KEPT = "Saved — leave blank to keep.";

/**
 * A write-only secret (client secret, API key, token, private key). A saved one is never shown: the field stays empty
 * and says so, and leaving it blank keeps the saved value.
 */
export function SecretField({ label, saved, value, onChange, disabled, helper, multiline = false }: { label: string; saved: boolean; value: string; onChange: (value: string) => void; disabled?: boolean; helper?: ReactNode; multiline?: boolean }) {
  const helperText = saved ? SECRET_KEPT : helper ?? "Write-only. It is encrypted and never shown again.";
  return (
    <Field label={label} optional={saved} helperText={helperText}>
      {multiline ? (
        <Textarea rows={4} value={value} disabled={disabled} spellCheck={false} autoComplete="off" className="code-text text-[13px]" onChange={(event) => onChange(event.target.value)} />
      ) : (
        <PasswordInput value={value} disabled={disabled} autoComplete="new-password" onChange={(event) => onChange(event.target.value)} />
      )}
    </Field>
  );
}
