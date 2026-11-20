"use client";

import { WebTelemetry } from "@/components/telemetry/WebTelemetry";
import type { TelemetryView } from "@/lib/telemetry/types";

/** Mount in the organisation's public layout. Its own config runs here, and the platform's does not. */
export function OrgWebTelemetry({ view }: { view: TelemetryView | null }) {
  return <WebTelemetry view={view} scope="org" />;
}
