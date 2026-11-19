import { safePage } from "./policy";

/**
 * Keeps a document that ever ran a provider from carrying it into an excluded route, another binding or a
 * different replay posture: crossing such a boundary stops the providers and replaces the document.
 * It wraps history.pushState/replaceState (which the Next.js router calls after a client navigation) and popstate.
 * Install once, on the client, as early as possible.
 */
export function installTelemetryBoundary(
  hasLoaded: () => boolean,
  stop: () => void,
  binding: (url: URL) => string | null,
  isolateReplay: (previous: URL, next: URL) => boolean = () => false,
) {
  let previous = new URL(window.location.href);
  const originals = { pushState: window.history.pushState, replaceState: window.history.replaceState };
  const crosses = (from: URL, to: URL) => !safePage(from) || !safePage(to) || binding(from) !== binding(to) || isolateReplay(from, to);
  for (const method of ["pushState", "replaceState"] as const) {
    const original = originals[method].bind(window.history);
    window.history[method] = (data, unused, target) => {
      const next = new URL(String(target ?? window.location.href), window.location.href);
      if (hasLoaded() && next.href !== previous.href && crosses(previous, next)) {
        try { stop(); } catch { /* never block navigation */ }
        if (next.origin === previous.origin && next.pathname === previous.pathname && next.search === previous.search && next.hash !== previous.hash) {
          original(data, unused, target);
          window.location.reload();
          return;
        }
        if (method === "replaceState") window.location.replace(next.href); else window.location.assign(next.href);
        return;
      }
      previous = next;
      original(data, unused, target);
    };
  }
  const pop = (event: PopStateEvent) => {
    const next = new URL(window.location.href);
    if (hasLoaded() && crosses(previous, next)) {
      event.stopImmediatePropagation();
      try { stop(); } catch { /* never block navigation */ }
      window.location.reload();
      return;
    }
    previous = next;
  };
  window.addEventListener("popstate", pop, true);
  return () => {
    window.history.pushState = originals.pushState;
    window.history.replaceState = originals.replaceState;
    window.removeEventListener("popstate", pop, true);
  };
}
