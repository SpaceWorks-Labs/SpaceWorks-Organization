import type { TelemetryAdapter } from "../controller";
import { TELEMETRY_CLIENT } from "../types";

declare global { interface Window { umami?: { track: (payload: { url: string; title: string; referrer: string; data?: { route: string; client: string } }) => void } } }

/** Official Umami tracker, invoked by hand after consent; no automatic page views. */
export function umami(siteId: string, origin: string, path: string): TelemetryAdapter {
  let script: HTMLScriptElement | undefined;
  const track = (url: string) => window.umami?.track({ url, title: "", referrer: "", data: { route: url, client: TELEMETRY_CLIENT } });
  return {
    purpose: "analytics",
    async start(signal, admitted) {
      if (signal.aborted || !admitted()) return;
      const tag = document.createElement("script");
      script = tag;
      tag.src = `${origin}/script.js`; tag.defer = true; tag.referrerPolicy = "no-referrer";
      tag.dataset.websiteId = siteId; tag.dataset.autoTrack = "false";
      await new Promise<void>((resolve, reject) => {
        tag.onload = () => resolve();
        tag.onerror = () => reject(new Error("Tracker unavailable"));
        signal.addEventListener("abort", () => { tag.remove(); reject(new Error("Cancelled")); }, { once: true });
        if (admitted() && !signal.aborted) document.head.append(tag); else reject(new Error("Cancelled"));
      });
      if (!signal.aborted && admitted()) track(path);
    },
    pageView: track,
    stop() { script?.remove(); },
  };
}
