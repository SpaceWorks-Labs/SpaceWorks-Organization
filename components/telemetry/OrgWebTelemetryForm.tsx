"use client";

import { saveOrgWebTelemetry } from "@/app/actions/org-web-telemetry";
import { WebTelemetryForm } from "@/components/super-admin/WebTelemetryForm";
import type { WebTelemetryConfig } from "@/lib/telemetry/types";

/** The platform's form, saving this organisation's own config. Mixpanel is the operator's alone, so it has no place here. */
export function OrgWebTelemetryForm({ slug, initial, allowedOrigins }: { slug: string; initial: WebTelemetryConfig; allowedOrigins: string[] }) {
  return <WebTelemetryForm initial={initial} allowedOrigins={allowedOrigins} mixpanelOn={false} onSave={(config) => saveOrgWebTelemetry({ organisationSlug: slug, config })} />;
}
