"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Callout, Card } from "@/components/ui/display";
import type { ConfiguredProvider } from "@/lib/telemetry/configured";
import type { Consent, Purpose } from "@/lib/telemetry/policy";
import { preferencesStore } from "@/lib/telemetry/preferencesStore";

const COPY: Record<Purpose, { label: string; detail: string }> = {
  analytics: { label: "Usage analytics", detail: "Counts visits to each kind of page, never by person." },
  replay: { label: "Session replay", detail: "Records a masked replay of visits to a few public pages." },
  diagnostics: { label: "Diagnostics and performance", detail: "Reports errors and load times, with no personal details." },
};
const ORDER: Purpose[] = ["analytics", "replay", "diagnostics"];

function Body({ providers, consent, failed, onSave }: { providers: ConfiguredProvider[]; consent: Consent; failed: boolean; onSave: (next: Consent) => void }) {
  const headingId = useId();
  const [draft, setDraft] = useState(consent);
  const purposes = ORDER.filter((purpose) => providers.some((item) => item.purpose === purpose));
  const all = (value: boolean) => ({ analytics: value, replay: value, diagnostics: value });
  return (
    <Card as="section" aria-labelledby={headingId} className="pointer-events-auto flex w-full max-w-[520px] flex-col gap-4 shadow-float">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-h4 text-ink">Privacy preferences</h2>
        <p className="text-body-ui text-ink-secondary">
          Nothing is sent to an outside service unless you agree. You can change your choices at any time from the footer.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {purposes.map((purpose) => (
          <CheckboxField
            key={purpose}
            checked={draft[purpose]}
            onCheckedChange={(checked) => setDraft((current) => ({ ...current, [purpose]: checked === true }))}
            label={COPY[purpose].label}
            description={`${COPY[purpose].detail} Provided by ${providers.filter((item) => item.purpose === purpose).map((item) => item.name).join(" and ")}.`}
          />
        ))}
      </div>
      {failed ? <Callout tone="warning" role="alert">Your choices could not be saved in this browser, so outside services stay off.</Callout> : null}
      {/* Accept all and Reject all carry equal weight, so neither is the nudged choice. */}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => onSave(all(true))}>Accept all</Button>
        <Button variant="secondary" onClick={() => onSave(all(false))}>Reject all</Button>
        <Button variant="quiet" onClick={() => onSave(draft)}>Save choices</Button>
      </div>
    </Card>
  );
}

/** Shown on public pages until the visitor chooses, and again whenever the footer link reopens it. */
export function PrivacyPreferences({ providers, consent, decided, failed, onSave }: { providers: ConfiguredProvider[]; consent: Consent; decided: boolean; failed: boolean; onSave: (next: Consent) => void }) {
  const { available, open } = useSyncExternalStore(preferencesStore.subscribe, preferencesStore.snapshot, preferencesStore.serverSnapshot);
  if (!available || (decided && !open)) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex justify-center p-4 md:justify-start md:p-6">
      <Body providers={providers} consent={consent} failed={failed} onSave={(next) => { onSave(next); preferencesStore.close(); }} />
    </div>
  );
}
