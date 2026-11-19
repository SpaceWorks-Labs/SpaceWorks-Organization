import { TelemetryController } from "./controller";
import { installTelemetryBoundary } from "./boundary";
import { safePage, type Consent } from "./policy";
import { replayRoute } from "./routes";
import { providerFactories } from "./providers";
import type { MixpanelConfig, WebTelemetryConfig } from "./types";

const controller = new TelemetryController();
let everLoaded = false, generation = 0, currentBinding: string | null = null, currentNavigation: string | null = null, ready = false;
let replayPolicyProvider = "none";
let pendingStart: Promise<void> | null = null, queued: { navigation: string; path: string } | null = null;

/** The scope binding of a URL: the organisation slug under /o/, else "root". A scope change is a boundary. */
export const bindingOf = (url: URL) => url.pathname.match(/^\/o\/([^/]+)/)?.[1] ?? "root";

let boundaryUsers = 0, removeBoundary: (() => void) | null = null;

/**
 * Install on the client. The platform and the organisation instance may both mount, so the history wrapper is
 * installed once and removed with its last user. Once a provider was admitted, the document is isolated until
 * it is replaced.
 */
export function installWebTelemetryBoundary() {
  if (boundaryUsers++ === 0) {
    removeBoundary = installTelemetryBoundary(
      () => everLoaded,
      () => { generation++; controller.stop(); },
      bindingOf,
      (previous, next) => replayRoute(replayPolicyProvider, safePage(previous)) !== replayRoute(replayPolicyProvider, safePage(next)),
    );
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--boundaryUsers === 0) { removeBoundary?.(); removeBoundary = null; }
  };
}

/** `binding` identifies scope + public configuration + consent; any change of it needs a fresh document. */
export async function updateWebTelemetry(binding: string, config: WebTelemetryConfig, consent: Consent, url: URL, anonymous: boolean, mixpanel: MixpanelConfig | null = null) {
  if (!anonymous) { stopWebTelemetry(); return; }
  const path = safePage(url);
  replayPolicyProvider = consent.replay ? config.replay.provider : "none";
  if (path && currentBinding === binding && pendingStart) { queued = { navigation: url.href, path }; await pendingStart; return; }
  if (path && currentBinding === binding && ready && (everLoaded || !replayRoute(replayPolicyProvider, path))) {
    if (currentNavigation !== url.href) { currentNavigation = url.href; controller.pageView(path); }
    return;
  }
  const myGeneration = ++generation;
  ready = false;
  if (everLoaded && currentBinding !== null && binding !== currentBinding) { controller.stop(); location.reload(); return; }
  currentBinding = binding;
  if (!path) { controller.stop(); return; }
  currentNavigation = url.href;
  queued = null;
  const factories = providerFactories(config, consent, path, mixpanel).map((factory) => ({ ...factory, load: async () => { everLoaded = true; return factory.load(); } }));
  const start = controller.start(url, consent, factories, () => generation === myGeneration && currentBinding === binding);
  pendingStart = start;
  await start;
  if (pendingStart === start) pendingStart = null;
  if (generation === myGeneration) {
    ready = true;
    const next = queued as { navigation: string; path: string } | null;
    if (next && next.navigation !== currentNavigation) { currentNavigation = next.navigation; controller.pageView(next.path); }
    queued = null;
  }
}

/** Withdrawal, a session, or leaving the approved routes: stop at once, and replace the document if a provider ever ran. */
export function stopWebTelemetry() {
  generation++; ready = false; pendingStart = null; queued = null;
  controller.stop();
  if (everLoaded) location.reload();
}
