// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { installTelemetryBoundary } from "@/lib/telemetry/boundary";
import { bindingOf } from "@/lib/telemetry/runtime";
import { consentScope } from "@/lib/telemetry/consentScope";
import { consentStorageKey, deniedConsent, hasDecision, readConsent, saveConsent } from "@/lib/telemetry/policy";

// jsdom cannot navigate, so location.assign/replace/reload are replaced for the duration of a test.
function stubLocation() {
  const calls = { assign: vi.fn(), replace: vi.fn(), reload: vi.fn() };
  const original = window.location;
  Object.defineProperty(window, "location", { configurable: true, value: { ...calls, get href() { return original.href; }, get origin() { return original.origin; }, get pathname() { return original.pathname; }, get search() { return original.search; }, get hash() { return original.hash; } } });
  return { calls, restore: () => Object.defineProperty(window, "location", { configurable: true, value: original }) };
}

let dispose: (() => void) | undefined;
let location$: ReturnType<typeof stubLocation> | undefined;
afterEach(() => { dispose?.(); location$?.restore(); dispose = undefined; location$ = undefined; });

function install(loaded: boolean, path: string) {
  history.replaceState(null, "", path);
  const stop = vi.fn();
  location$ = stubLocation();
  dispose = installTelemetryBoundary(() => loaded, stop, bindingOf);
  return { stop, calls: location$.calls };
}

describe("telemetry boundary", () => {
  it("keeps navigation between approved public pages in the same document", () => {
    const { stop, calls } = install(true, "/about");
    history.pushState(null, "", "/features");
    expect(stop).not.toHaveBeenCalled();
    expect(calls.assign).not.toHaveBeenCalled();
  });

  it("stops providers and forces a full load when a loaded document goes to a private route", () => {
    for (const target of ["/login", "/dashboard", "/account", "/pay/tok", "/join/org/tok", "/verify/tok", "/about?x=1"]) {
      const { stop, calls } = install(true, "/about");
      history.pushState(null, "", target);
      expect(stop, target).toHaveBeenCalled();
      expect(calls.assign, target).toHaveBeenCalledWith(new URL(target, location.href).href);
      dispose?.(); location$?.restore();
    }
  });

  it("replaceState to a private route replaces the entry with a full load", () => {
    const { stop, calls } = install(true, "/o/acme");
    history.replaceState(null, "", "/dashboard");
    expect(stop).toHaveBeenCalled();
    expect(calls.replace).toHaveBeenCalled();
  });

  it("forces a full load when crossing from one scope binding to another", () => {
    const { stop, calls } = install(true, "/o/acme");
    history.pushState(null, "", "/o/other");
    expect(stop).toHaveBeenCalled();
    expect(calls.assign).toHaveBeenCalled();
    expect(bindingOf(new URL("https://x.test/o/acme/join/p"))).toBe("acme");
    expect(bindingOf(new URL("https://x.test/about"))).toBe("root");
  });

  it("is inert when no provider ever loaded, so nothing reloads needlessly", () => {
    const { stop, calls } = install(false, "/about");
    history.pushState(null, "", "/login");
    expect(stop).not.toHaveBeenCalled();
    expect(calls.assign).not.toHaveBeenCalled();
  });

  it("reloads on back/forward into an excluded page", () => {
    const { stop, calls } = install(true, "/about");
    // The browser moves to an excluded entry without going through the patched methods.
    Object.getPrototypeOf(history).replaceState.call(history, null, "", "/login");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(stop).toHaveBeenCalled();
    expect(calls.reload).toHaveBeenCalled();
  });

  it("restores history on dispose", () => {
    const before = history.pushState;
    install(true, "/about");
    expect(history.pushState).not.toBe(before);
    dispose?.(); dispose = undefined;
    expect(history.pushState).toBe(before);
  });
});

describe("consent record", () => {
  afterEach(() => localStorage.clear());

  it("writes nothing on a first visit and denies everything", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    expect(readConsent("platform:abc")).toEqual(deniedConsent());
    expect(hasDecision("platform:abc")).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    setItem.mockRestore();
  });

  it("stores only the consent record, once the visitor chooses, and reads it back", () => {
    expect(saveConsent("platform:abc", { analytics: true, replay: false, diagnostics: false })).toBe(true);
    expect(Object.keys(localStorage)).toEqual([consentStorageKey("platform:abc")]);
    expect(readConsent("platform:abc")).toEqual({ analytics: true, replay: false, diagnostics: false });
    expect(hasDecision("platform:abc")).toBe(true);
  });

  it("denies a grant made under a different scope or configuration, and when storage cannot be written", async () => {
    saveConsent(await consentScope("platform", { a: 1 }), { analytics: true, replay: true, diagnostics: true });
    expect(readConsent(await consentScope("platform", { a: 2 }))).toEqual(deniedConsent());
    expect(readConsent(await consentScope("org:1", { a: 1 }))).toEqual(deniedConsent());
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(readConsent(await consentScope("platform", { a: 1 }))).toEqual(deniedConsent());
    vi.restoreAllMocks();
  });
});
