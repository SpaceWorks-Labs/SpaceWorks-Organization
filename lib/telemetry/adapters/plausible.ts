import type { TelemetryAdapter } from "../controller";
import { TELEMETRY_CLIENT } from "../types";

/** Explicit events use a route template and no referrer; Plausible's own script is never loaded. */
export function plausible(domain: string, origin: string, path: string): TelemetryAdapter {
  let request: AbortController | undefined, allowed: () => boolean = () => false;
  const send = (route: string) => {
    if (!allowed()) return;
    request = new AbortController();
    void fetch(`${origin}/api/event`, {
      method: "POST", mode: "cors", credentials: "omit", referrerPolicy: "no-referrer",
      headers: { "Content-Type": "text/plain" }, signal: request.signal,
      body: JSON.stringify({ n: "pageview", u: `${location.origin}${route}`, d: domain, r: "", p: { route, client: TELEMETRY_CLIENT } }),
    }).catch(() => undefined);
  };
  return {
    purpose: "analytics",
    async start(signal, admitted) {
      allowed = () => !signal.aborted && admitted();
      signal.addEventListener("abort", () => request?.abort(), { once: true });
      send(path);
    },
    pageView: send,
    stop() { allowed = () => false; request?.abort(); },
  };
}
