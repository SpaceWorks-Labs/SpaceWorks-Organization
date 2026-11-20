import type { TelemetryAdapter } from "../controller";
import { TELEMETRY_CLIENT } from "../types";

declare global { interface Window { dataLayer?: unknown[][]; gtag?: (...args: unknown[]) => void } }

/** GA4 emits only an explicit sanitised page view; the automatic one, Google signals and ad personalisation are off. */
export function ga4(measurementId: string, path: string): TelemetryAdapter {
  let script: HTMLScriptElement | undefined;
  const view = (route: string) => window.gtag?.("event", "page_view", { page_location: `${location.origin}${route}`, page_referrer: "", page_title: "", route, client: TELEMETRY_CLIENT });
  return {
    purpose: "analytics",
    async start(signal, admitted) {
      if (signal.aborted || !admitted()) return;
      window.dataLayer = window.dataLayer ?? [];
      window.gtag = (...args: unknown[]) => window.dataLayer?.push(args);
      window.gtag("js", new Date());
      window.gtag("config", measurementId, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
      const tag = document.createElement("script");
      tag.async = true; tag.referrerPolicy = "no-referrer";
      tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
      if (signal.aborted || !admitted()) return;
      script = tag;
      document.head.append(tag);
      view(path);
    },
    pageView: view,
    stop() { if (script) Reflect.set(window, `ga-disable-${measurementId}`, true); script?.remove(); },
  };
}
