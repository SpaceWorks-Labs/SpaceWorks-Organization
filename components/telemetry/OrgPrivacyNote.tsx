import type { ConfiguredProvider } from "@/lib/telemetry/configured";
import { PrivacyPreferencesLink } from "@/components/telemetry/PrivacyPreferencesLink";

const PURPOSE: Record<ConfiguredProvider["purpose"], string> = { analytics: "usage analytics", replay: "session replay", diagnostics: "diagnostics and performance" };

/** What this organisation's public pages may send to outside services, and only after a visitor agrees. Renders nothing without providers. */
export function OrgPrivacyNote({ organisation, providers }: { organisation: string; providers: ConfiguredProvider[] }) {
  if (!providers.length) return null;
  return (
    <p className="text-caption text-ink-muted">
      {organisation} uses {providers.map((item) => `${item.name} for ${PURPOSE[item.purpose]}`).join(", ")} on these pages, only if you agree. Nothing is sent otherwise.{" "}
      <PrivacyPreferencesLink />
    </p>
  );
}
