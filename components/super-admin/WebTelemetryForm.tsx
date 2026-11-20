"use client";

import { useState, useTransition } from "react";
import { saveWebTelemetry } from "@/app/actions/web-telemetry";
import { Button } from "@/components/ui/button";
import { SwitchRow } from "@/components/ui/choice";
import { Callout, Card, SettingsRow } from "@/components/ui/display";
import { Dropdown, Field, Input } from "@/components/ui/field";
import type { ActionResult } from "@/app/actions/org";
import type { PageProvider, ReplayProvider, WebTelemetryConfig } from "@/lib/telemetry/types";

const PAGE_LABELS: Record<PageProvider, string> = { none: "Off", plausible: "Plausible", umami: "Umami", ga4: "Google Analytics 4", firebase: "Firebase Analytics", posthog: "PostHog" };
const REPLAY_LABELS: Record<ReplayProvider, string> = { none: "Off", clarity: "Microsoft Clarity", posthog: "PostHog" };
const ID_HELP: Record<string, string> = {
  plausible: "Your site's domain, for example example.org.",
  umami: "The website id (a UUID).",
  ga4: "The measurement id, like G-XXXXXXX.",
  posthog: "The project API key, starting phc_. It is public.",
  clarity: "The Clarity project id.",
};
const ENDPOINT_PROVIDERS = ["plausible", "umami", "posthog"];

/** Public ids only. The operator approves outside origins in WEB_TELEMETRY_ALLOWED_ORIGINS; secrets have no field here. */
export function WebTelemetryForm({ initial, allowedOrigins, mixpanelOn, onSave = saveWebTelemetry }: { initial: WebTelemetryConfig; allowedOrigins: string[]; mixpanelOn: boolean; onSave?: (value: WebTelemetryConfig) => Promise<ActionResult> }) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const patch = <K extends keyof WebTelemetryConfig>(key: K, next: Partial<WebTelemetryConfig[K]>) => setValue((current) => ({ ...current, [key]: { ...current[key], ...next } }));
  const { pageview, replay, diagnostics, firebase } = value;

  const submit = () => startTransition(async () => {
    setStatus(null);
    const result = await onSave(value);
    setStatus(result.ok ? { ok: true, text: "Web analytics saved." } : { ok: false, text: result.error });
  });

  const originField = (label: string, current: string, onChange: (next: string) => void) => (
    <Field label={label} optional helperText={allowedOrigins.length ? "Must be one of the approved origins listed above." : "Needs an origin in WEB_TELEMETRY_ALLOWED_ORIGINS."}>
      <Input value={current} onChange={(event) => onChange(event.target.value)} placeholder="https://" inputMode="url" spellCheck={false} />
    </Field>
  );
  const idField = (provider: string, current: string, onChange: (next: string) => void) => (
    <Field label="Identifier" helperText={ID_HELP[provider]}>
      <Input value={current} onChange={(event) => onChange(event.target.value)} spellCheck={false} autoComplete="off" />
    </Field>
  );

  return (
    <form className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <Callout tone="info" title="Off until a visitor agrees">
        Nothing here loads, sends or stores anything until it is set up and the visitor agrees to that purpose in Privacy preferences. Use public identifiers only, never secrets.
        {allowedOrigins.length ? ` Approved origins: ${allowedOrigins.join(", ")}.` : " No origins are approved yet, so providers that need one cannot be saved."}
      </Callout>
      {mixpanelOn ? <Callout tone="warning">A Mixpanel project is set in the server environment. It replaces the page analytics provider below while it is set.</Callout> : null}
      {status ? <Callout tone={status.ok ? "success" : "danger"} role={status.ok ? "status" : "alert"}>{status.text}</Callout> : null}
      <Card padding="none" className="rounded-xl px-5">
        <SettingsRow title="Page analytics" description="Counts visits to each kind of public page. Choose one provider.">
          <div className="flex flex-col gap-4">
            <Field label="Provider">
              <Dropdown value={pageview.provider} onChange={(event) => patch("pageview", { provider: event.target.value as PageProvider, siteId: "", endpoint: "" })}>
                {(Object.keys(PAGE_LABELS) as PageProvider[]).map((key) => <option key={key} value={key}>{PAGE_LABELS[key]}</option>)}
              </Dropdown>
            </Field>
            {pageview.provider !== "none" && pageview.provider !== "firebase" ? idField(pageview.provider, pageview.siteId, (siteId) => patch("pageview", { siteId })) : null}
            {ENDPOINT_PROVIDERS.includes(pageview.provider) ? originField("Origin", pageview.endpoint, (endpoint) => patch("pageview", { endpoint })) : null}
            {pageview.provider === "firebase" ? <p className="text-caption text-ink-muted">Fill in the Firebase web app below, including the measurement id.</p> : null}
          </div>
        </SettingsRow>
        <SettingsRow title="Session replay" description="A masked replay of a few anonymous public pages. PostHog must use the same project and origin as page analytics.">
          <div className="flex flex-col gap-4">
            <Field label="Provider">
              <Dropdown value={replay.provider} onChange={(event) => patch("replay", { provider: event.target.value as ReplayProvider, siteId: "", endpoint: "" })}>
                {(Object.keys(REPLAY_LABELS) as ReplayProvider[]).map((key) => <option key={key} value={key}>{REPLAY_LABELS[key]}</option>)}
              </Dropdown>
            </Field>
            {replay.provider !== "none" ? idField(replay.provider, replay.siteId, (siteId) => patch("replay", { siteId })) : null}
            {replay.provider === "posthog" ? originField("Origin", replay.endpoint, (endpoint) => patch("replay", { endpoint })) : null}
          </div>
        </SettingsRow>
        <SettingsRow title="Diagnostics and performance" description="Errors and load times with scrubbed addresses and no personal details.">
          <div className="flex flex-col gap-4">
            <SwitchRow label="Sentry" description="Browser errors." checked={diagnostics.sentry.enabled} onCheckedChange={(enabled) => setValue((c) => ({ ...c, diagnostics: { ...c.diagnostics, sentry: { ...c.diagnostics.sentry, enabled } } }))} />
            {diagnostics.sentry.enabled ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
                <Field label="Public DSN" helperText="Its origin must be approved.">
                  <Input value={diagnostics.sentry.dsn} onChange={(event) => setValue((c) => ({ ...c, diagnostics: { ...c.diagnostics, sentry: { ...c.diagnostics.sentry, dsn: event.target.value } } }))} spellCheck={false} autoComplete="off" />
                </Field>
                <Field label="Sample rate" helperText="0 to 1.">
                  <Input type="number" min={0} max={1} step={0.05} value={diagnostics.sentry.sampleRate} onChange={(event) => setValue((c) => ({ ...c, diagnostics: { ...c.diagnostics, sentry: { ...c.diagnostics.sentry, sampleRate: Number(event.target.value) } } }))} />
                </Field>
              </div>
            ) : null}
            <SwitchRow label="Firebase Performance" description="One sanitised load trace." checked={diagnostics.firebasePerformance.enabled} onCheckedChange={(enabled) => setValue((c) => ({ ...c, diagnostics: { ...c.diagnostics, firebasePerformance: { ...c.diagnostics.firebasePerformance, enabled } } }))} />
            {diagnostics.firebasePerformance.enabled ? (
              <Field label="Sample rate" helperText="0 to 1. Needs the Firebase web app below.">
                <Input type="number" min={0} max={1} step={0.05} value={diagnostics.firebasePerformance.sampleRate} onChange={(event) => setValue((c) => ({ ...c, diagnostics: { ...c.diagnostics, firebasePerformance: { ...c.diagnostics.firebasePerformance, sampleRate: Number(event.target.value) } } }))} />
              </Field>
            ) : null}
          </div>
        </SettingsRow>
        <SettingsRow title="Firebase web app" description="Used by Firebase Analytics and Firebase Performance. These values are public.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {([["apiKey", "API key"], ["authDomain", "Auth domain"], ["projectId", "Project id"], ["appId", "App id"], ["measurementId", "Measurement id"]] as const).map(([key, label]) => (
              <Field key={key} label={label} optional>
                <Input value={firebase[key]} onChange={(event) => patch("firebase", { [key]: event.target.value })} spellCheck={false} autoComplete="off" />
              </Field>
            ))}
          </div>
        </SettingsRow>
      </Card>
      <div>
        <Button type="submit" variant="primary" loading={pending}>Save web analytics</Button>
      </div>
    </form>
  );
}
