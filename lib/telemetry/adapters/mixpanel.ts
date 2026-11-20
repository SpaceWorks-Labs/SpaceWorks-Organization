import type { TelemetryAdapter } from "../controller";
import { safePage } from "../policy";
import { TELEMETRY_CLIENT, type MixpanelConfig } from "../types";

export const browserKey = (token: string) => `spaceworks.mixpanel.browser.v1:${token}`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Instance = {
  track: (event: string) => void;
  stop_batch_senders: () => void;
  opt_out_tracking: (options: { clear_persistence: boolean; delete_user: boolean }) => void;
  clear_opt_in_out_tracking: (options: { enable_persistence: boolean }) => void;
};
type Sdk = { init: (token: string, config: Record<string, unknown>, name: string) => Instance };
declare global { interface Window { mixpanel?: Sdk | { __SV: number; _i: never[] } } }

/** The empty snippet queue cannot initialise a project or emit an event while the SDK downloads. */
function loadSdk(host: string, signal: AbortSignal): Promise<Sdk | null> {
  return new Promise((resolve, reject) => {
    // Anonymous CORS still includes same-origin credentials, so a mirror on this origin is refused.
    if (signal.aborted || new URL(host).origin === window.location.origin) { resolve(null); return; }
    const script = document.createElement("script");
    script.id = "spaceworks-mixpanel";
    script.crossOrigin = "anonymous"; script.referrerPolicy = "no-referrer"; script.async = true;
    script.src = `${host}/libs/mixpanel-2-latest.min.js`;
    window.mixpanel = { __SV: 1.2, _i: [] };
    const drop = () => { script.remove(); delete window.mixpanel; };
    const abort = () => { cleanup(); drop(); resolve(null); };
    const cleanup = () => { signal.removeEventListener("abort", abort); script.onload = null; script.onerror = null; };
    signal.addEventListener("abort", abort, { once: true });
    script.onload = () => {
      cleanup();
      const sdk = window.mixpanel;
      if (sdk && "init" in sdk && typeof sdk.init === "function") resolve(sdk);
      else { drop(); reject(new Error("mixpanel_sdk_unavailable")); }
    };
    script.onerror = () => { cleanup(); drop(); reject(new Error("mixpanel_sdk_unavailable")); };
    document.head.append(script);
  });
}

/** `page_view` only: no profiles, autocapture, replay, vendor persistence or default SDK transport. */
export function mixpanel(config: MixpanelConfig, initialPath: string): TelemetryAdapter {
  let instance: Instance | undefined;
  let active = false, browserId = "", path = initialPath;
  const requests = new Set<AbortController>();
  let allowed = () => false;
  const send = (event: { event: string }) => {
    if (!active || !allowed() || event.event !== "page_view" || safePage(new URL(location.href)) !== path) return null;
    const request = new AbortController();
    requests.add(request);
    // Rebuilt at the last boundary: every SDK property (URL, referrer, device, attribution) is discarded.
    const payload = { event: "page_view", properties: { token: config.token, distinct_id: browserId, route: path, client: TELEMETRY_CLIENT } };
    void fetch(`${config.apiHost}/track/?ip=0`, {
      method: "POST", mode: "cors", credentials: "omit", referrerPolicy: "no-referrer", redirect: "error",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify([payload]), signal: request.signal,
    }).catch(() => undefined).finally(() => requests.delete(request));
    return null; // Suppress the SDK transport, which would attach credentials.
  };
  return {
    purpose: "analytics",
    async start(signal, admitted) {
      if (signal.aborted || !admitted()) return;
      const sdk = await loadSdk(config.sdkHost, signal);
      if (!sdk || signal.aborted || !admitted()) return;
      const stored = localStorage.getItem(browserKey(config.token));
      browserId = stored && uuid.test(stored) ? stored : crypto.randomUUID();
      localStorage.setItem(browserKey(config.token), browserId);
      allowed = () => !signal.aborted && admitted();
      active = true;
      instance = sdk.init(config.token, {
        api_host: config.apiHost, autocapture: false, track_pageview: false, disable_persistence: true, disable_cookie: true,
        batch_requests: false, batch_autostart: false, save_referrer: false, store_google: false, stop_utm_persistence: true,
        skip_first_touch_marketing: true, ip: false, record_sessions_percent: 0, record_heatmap_data: false, flags: false,
        track_marketing: false, remote_settings_mode: "disabled", hooks: { before_send_events: send },
      }, "spaceworks");
      if (allowed()) instance?.track("page_view");
    },
    pageView(next) { path = next; if (active && allowed()) instance?.track("page_view"); },
    stop() {
      active = false;
      for (const request of requests) request.abort();
      requests.clear();
      try {
        instance?.stop_batch_senders();
        instance?.opt_out_tracking({ clear_persistence: true, delete_user: false });
        instance?.clear_opt_in_out_tracking({ enable_persistence: false });
      } finally {
        document.getElementById("spaceworks-mixpanel")?.remove();
        delete window.mixpanel;
        try { localStorage.removeItem(browserKey(config.token)); } catch { /* collection is already stopped */ }
      }
    },
  };
}
