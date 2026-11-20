"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout, Chip } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { AccountCard } from "@/components/account/AccountCard";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { SecurityList, SecurityRow } from "./SecurityRow";
import { confirmPhoneCode, removePhoneNumber, sendPhoneCode } from "@/app/actions/phone";

type Step = "idle" | "number" | "code";

/** The phone card's controls. The number is typed, texted a code and confirmed; it is never shown in full again. */
export function PhoneCardForm({ available, maskedPhone }: { available: boolean; maskedPhone: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("idle");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [pending, startTransition] = useTransition();

  const send = () => startTransition(async () => {
    const result = await sendPhoneCode({ phone });
    if (result.ok) { setStatus({ ok: true, text: "We've texted a six-digit code to that number. It works for 10 minutes." }); setCode(""); setStep("code"); }
    else setStatus({ ok: false, text: result.error });
  });
  const confirm = () => startTransition(async () => {
    const result = await confirmPhoneCode({ phone, code });
    if (!result.ok) { setStatus({ ok: false, text: result.error }); return; }
    setStatus({ ok: true, text: "Phone number saved. You can now sign in with a code sent to it." });
    setStep("idle"); setPhone(""); setCode("");
    router.refresh();
  });
  const remove = () => startTransition(async () => {
    const result = await removePhoneNumber();
    setStatus(result.ok ? { ok: true, text: "Phone number removed." } : { ok: false, text: result.error });
    if (result.ok) router.refresh();
  });

  return (
    <AccountCard id="phone-sign-in" title="Phone number" description="Sign in with a six-digit code sent to your phone by text message.">
      <div className="flex flex-col gap-4">
        {status ? <Callout tone={status.ok ? "success" : "danger"} role={status.ok ? "status" : "alert"}>{status.text}</Callout> : null}
        {step === "idle" ? (
          <SecurityList>
            <SecurityRow
              icon={<Smartphone />}
              title={<span className="tabular-nums">{maskedPhone ?? "No phone number"}</span>}
              description={maskedPhone ? "Verified. Only you can use it to sign in." : "Add one to sign in with a texted code."}
              status={maskedPhone ? <Chip size="sm" tone="success">Verified</Chip> : null}
              actions={available || maskedPhone ? (
                <>
                  {available ? <Button size="sm" variant="secondary" disabled={pending} onClick={() => { setStatus(null); setStep("number"); }}>{maskedPhone ? "Change number" : "Add a number"}</Button> : null}
                  {maskedPhone ? <Button size="sm" variant="danger" loading={pending} onClick={() => setRemoving(true)}>Remove</Button> : null}
                </>
              ) : null}
            />
          </SecurityList>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); if (step === "number") send(); else confirm(); }}>
            {step === "number" ? (
              <Field label="Phone number" required helperText="Include the country code, such as +91.">
                <Input autoFocus type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" inputMode="tel" />
              </Field>
            ) : (
              <Field label="Code from the text message" required>
                <Input autoFocus value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" inputMode="numeric" />
              </Field>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="primary" loading={pending} disabled={step === "number" ? !phone.trim() : !code.trim()}>{step === "number" ? "Send code" : "Confirm number"}</Button>
              {step === "code" ? <Button variant="quiet" disabled={pending} onClick={send}>Send a new code</Button> : null}
              <Button variant="quiet" disabled={pending} onClick={() => { setStep("idle"); setStatus(null); }}>Cancel</Button>
            </div>
          </form>
        )}
      </div>
      <ConfirmationDialog
        open={removing}
        title="Remove your phone number?"
        message="You won't be able to sign in with a texted code until you add a number again."
        confirmLabel="Remove number"
        loading={pending}
        onCancel={() => setRemoving(false)}
        onConfirm={() => { setRemoving(false); remove(); }}
      />
    </AccountCard>
  );
}
