import type { TelemetryAdapter } from "../controller";
import { TELEMETRY_CLIENT } from "../types";

type ClarityCommand = ((command: string, ...values: unknown[]) => void) & { q?: unknown[][] };
declare global { interface Window { clarity?: ClarityCommand } }

/** Confined to an isolated, consented, anonymous public document; everything is masked. */
export function clarity(projectId: string): TelemetryAdapter {
  let script: HTMLScriptElement | undefined;
  let stopped = false;
  return {
    purpose: "replay",
    async start(signal, admitted) {
      if (signal.aborted || !admitted()) return;
      document.documentElement.setAttribute("data-clarity-mask", "True");
      const queue: ClarityCommand = (command, ...values) => { (queue.q ??= []).push([command, ...values]); };
      window.clarity = queue;
      queue("consentv2", { ad_Storage: "denied", analytics_Storage: "granted" });
      queue("set", "client", TELEMETRY_CLIENT);
      const tag = document.createElement("script");
      tag.async = true; tag.referrerPolicy = "no-referrer";
      tag.src = `https://www.clarity.ms/tag/${encodeURIComponent(projectId)}`;
      if (signal.aborted || !admitted()) return;
      script = tag;
      document.head.append(tag);
    },
    stop() {
      if (stopped || !script) return;
      stopped = true;
      // Denied consent still tracks, and stop flushes. Seal this document before vendor teardown;
      // the runtime then replaces the document with a full reload.
      const policy = document.createElement("meta");
      policy.httpEquiv = "Content-Security-Policy";
      policy.content = "connect-src 'self'; script-src 'self'; img-src 'self' data: blob:";
      document.head.prepend(policy);
      try { window.clarity?.("consentv2", { ad_Storage: "denied", analytics_Storage: "denied" }); } catch { /* the outbound barrier remains */ }
      try { window.clarity?.("stop", undefined); } catch { /* document replacement remains mandatory */ }
      script.remove();
    },
  };
}
