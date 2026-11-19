import type { TelemetryAdapter } from "../controller";
import { TELEMETRY_CLIENT } from "../types";

/** One instance serves same-project analytics and replay. Replay is fully masked; nothing is autocaptured. */
export function posthog(projectId: string, origin: string, analytics: boolean, replay: boolean, path: string): TelemetryAdapter {
  let currentPath = path;
  let instance: typeof import("posthog-js/dist/module.slim").default | undefined;
  const view = (route: string) => instance?.capture("page_view", { $current_url: `${location.origin}${route}`, route, client: TELEMETRY_CLIENT });
  return {
    purpose: analytics ? "analytics" : "replay",
    async start(signal, admitted) {
      const [{ default: sdk }, extensions] = await Promise.all([import("posthog-js/dist/module.slim"), import("posthog-js/dist/extension-bundles")]);
      if (signal.aborted || !admitted()) return;
      instance = sdk;
      sdk.init(projectId, {
        api_host: origin, autocapture: false, capture_pageview: false, capture_pageleave: false,
        opt_out_capturing_by_default: true, disable_session_recording: true, disable_surveys: true,
        advanced_disable_feature_flags: true, advanced_disable_feature_flags_on_first_load: true,
        enable_recording_console_log: false, capture_performance: false,
        before_send: (event) => {
          if (event.event === "$snapshot" && replay) return event;
          if (event.event !== "page_view" || !analytics) return null;
          // Rebuilt from an allow-list: no URL, referrer, device or person properties leave the browser.
          return { ...event, properties: { token: projectId, distinct_id: event.properties.distinct_id, $session_id: event.properties.$session_id, client: TELEMETRY_CLIENT, $current_url: `${location.origin}${currentPath}` }, $set: undefined, $set_once: undefined, $unset: undefined };
        },
        __extensionClasses: replay ? { ...extensions.SessionReplayExtensions } : {},
        session_recording: { maskAllInputs: true, maskAllElementAttributes: true, recordHeaders: false, recordBody: false, maskTextSelector: "*", blockSelector: "img,video,canvas,iframe,[data-replay-block]", maskCapturedNetworkRequestFn: () => null },
      });
      if (signal.aborted || !admitted()) { sdk.opt_out_capturing(); return; }
      sdk.opt_in_capturing({ captureEventName: false });
      if (replay) sdk.startSessionRecording();
      if (analytics) view(path);
    },
    pageView(next) { currentPath = next; if (analytics) view(next); },
    stop() { instance?.stopSessionRecording(); instance?.opt_out_capturing(); },
  };
}
