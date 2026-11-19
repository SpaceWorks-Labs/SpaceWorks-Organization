"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { PrivacyPreferences } from "@/components/telemetry/PrivacyPreferences";
import { configuredProviders, isConfigured } from "@/lib/telemetry/configured";
import { telemetryScopeApplies } from "@/lib/telemetry/organisation";
import { consentScope } from "@/lib/telemetry/consentScope";
import { consentStorageKey, deniedConsent, hasDecision, readConsent, safePage, saveConsent, type Consent } from "@/lib/telemetry/policy";
import { preferencesStore } from "@/lib/telemetry/preferencesStore";
import { installWebTelemetryBoundary, stopWebTelemetry, updateWebTelemetry } from "@/lib/telemetry/runtime";
import type { TelemetryView } from "@/lib/telemetry/types";

type Resolved = { identity: string; key: string; consent: Consent; decided: boolean; failed: boolean };

/**
 * Mount once inside the root layout's Providers (it uses the session). `view` is null for signed-in visitors and
 * when nothing is configured, and then this renders nothing and loads nothing. Otherwise it still writes nothing
 * until the visitor chooses; the consent record is the only key it ever stores.
 */
export function WebTelemetry({ view: given, scope = "platform" }: { view: TelemetryView | null; scope?: "platform" | "org" }) {
  const pathname = usePathname();
  const { status } = useSession();
  // One page-analytics provider per page: the platform's config runs on every public page except under /o/, where
  // only that organisation's own config (the "org" scope, mounted by its layout) may run.
  const view = telemetryScopeApplies(scope, pathname) ? given : null;
  const active = view !== null && isConfigured(view.config, view.mixpanel);
  // The consent scope covers the scope id and the public configuration; a change of either needs a new grant.
  const identity = view && active ? JSON.stringify([view.scopeId, view.config, view.mixpanel]) : "";
  const [state, setState] = useState<Resolved | null>(null);
  const resolved = state?.identity === identity && identity ? state : null;

  useEffect(() => (active ? installWebTelemetryBoundary() : undefined), [active]);

  useEffect(() => {
    if (!view || !identity) return;
    let current = true;
    const load = (key: string) => setState({ identity, key, consent: readConsent(key), decided: hasDecision(key), failed: false });
    let key = "";
    const changed = (event: StorageEvent) => { if (key && event.storageArea === localStorage && (event.key === consentStorageKey(key) || event.key === null)) load(key); };
    void consentScope(view.scopeId, [view.config, view.mixpanel]).then((value) => {
      if (!current) return;
      key = value;
      load(value);
      window.addEventListener("storage", changed);
    }).catch(() => undefined);
    return () => { current = false; window.removeEventListener("storage", changed); };
  }, [view, identity]);

  const publicPage = Boolean(resolved && typeof window !== "undefined" && safePage(new URL(window.location.href)));
  useEffect(() => {
    // An instance that does not apply here must not touch the shared panel store.
    if (!view) return;
    preferencesStore.setAvailable(publicPage && status !== "authenticated");
    return () => preferencesStore.setAvailable(false);
  }, [view, publicPage, status]);

  const key = resolved?.key, consent = resolved?.consent;
  useEffect(() => {
    if (!view || !key || !consent) return;
    // A session appearing in this document (a sign-in elsewhere in the tab) stops everything and replaces it.
    if (status === "authenticated") { stopWebTelemetry(); return; }
    void updateWebTelemetry(`${key}:${JSON.stringify(consent)}`, view.config, consent, new URL(window.location.href), true, view.mixpanel);
  }, [view, key, consent, pathname, status]);

  if (!view || !resolved || !publicPage || status === "authenticated") return null;
  const save = (next: Consent) => {
    const saved = saveConsent(resolved.key, next);
    setState({ ...resolved, consent: saved ? next : deniedConsent(), decided: saved, failed: !saved });
  };
  return <PrivacyPreferences providers={configuredProviders(view.config, view.mixpanel)} consent={resolved.consent} decided={resolved.decided} failed={resolved.failed} onSave={save} />;
}
