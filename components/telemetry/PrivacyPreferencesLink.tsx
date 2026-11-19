"use client";

import { useSyncExternalStore } from "react";
import { preferencesStore } from "@/lib/telemetry/preferencesStore";

/** Footer link that reopens the Privacy preferences panel. It renders only while the panel applies to this page. */
export function PrivacyPreferencesLink({ className }: { className?: string }) {
  const { available } = useSyncExternalStore(preferencesStore.subscribe, preferencesStore.snapshot, preferencesStore.serverSnapshot);
  if (!available) return null;
  return <button type="button" className={className} onClick={preferencesStore.open}>Privacy preferences</button>;
}
