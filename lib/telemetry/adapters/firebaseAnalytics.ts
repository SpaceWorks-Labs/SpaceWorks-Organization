import type { TelemetryAdapter } from "../controller";
import { TELEMETRY_CLIENT, type FirebaseConfig } from "../types";

/** Same property as GA4: choose one or the other. Sanitised page views only, signals and personalisation off. */
export function firebaseAnalytics(config: FirebaseConfig, path: string): TelemetryAdapter {
  let sdk: typeof import("@firebase/analytics") | undefined;
  let analytics: import("@firebase/analytics").Analytics | undefined;
  const view = (route: string) => {
    if (analytics) sdk?.logEvent(analytics, "page_view", { page_location: `${location.origin}${route}`, page_referrer: "", page_title: "", route, client: TELEMETRY_CLIENT });
  };
  return {
    purpose: "analytics",
    async start(signal, admitted) {
      const [app, analyticsSdk] = await Promise.all([import("@firebase/app"), import("@firebase/analytics")]);
      if (signal.aborted || !admitted() || !(await analyticsSdk.isSupported())) return;
      if (signal.aborted || !admitted()) return;
      const firebase = app.getApps().find((item) => item.name === "spaceworks-telemetry") ?? app.initializeApp(config, "spaceworks-telemetry");
      sdk = analyticsSdk;
      analytics = analyticsSdk.initializeAnalytics(firebase, { config: { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false } });
      view(path);
    },
    pageView: view,
    stop() { if (analytics) sdk?.setAnalyticsCollectionEnabled(analytics, false); },
  };
}
