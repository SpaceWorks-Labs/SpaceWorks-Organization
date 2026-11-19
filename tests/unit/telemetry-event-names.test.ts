import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TELEMETRY_EVENTS } from "@/lib/telemetry/events";

const dir = join(process.cwd(), "lib/telemetry/adapters");
const source = (name: string) => readFileSync(join(dir, name), "utf8");
const pageAdapters = ["ga4.ts", "firebaseAnalytics.ts", "posthog.ts", "mixpanel.ts", "plausible.ts", "umami.ts"];

describe("shared analytics event names (product rules §8.4)", () => {
  it("lists page_view as the one shared event", () => {
    expect(TELEMETRY_EVENTS).toEqual(["page_view"]);
  });

  it("covers every page-analytics adapter", () => {
    const files = readdirSync(dir).filter((name) => name.endsWith(".ts"));
    for (const name of pageAdapters) expect(files).toContain(name);
  });

  it.each(pageAdapters)("%s sends the route template and the client with each page view", (name) => {
    const text = source(name);
    expect(text).toMatch(/\broute\b/);
    expect(text).toContain("TELEMETRY_CLIENT");
  });

  it.each(["ga4.ts", "firebaseAnalytics.ts", "posthog.ts", "mixpanel.ts"])("%s uses the shared name page_view, never a vendor page event", (name) => {
    const text = source(name);
    expect(text).toContain('"page_view"');
    expect(text).not.toContain('"$pageview"');
    expect(text).not.toContain('"screen_view"');
  });

  it("keeps every provider's automatic page events off", () => {
    expect(source("ga4.ts")).toContain("send_page_view: false");
    expect(source("firebaseAnalytics.ts")).toContain("send_page_view: false");
    expect(source("posthog.ts")).toContain("capture_pageview: false");
    expect(source("mixpanel.ts")).toContain("track_pageview: false");
    expect(source("umami.ts")).toMatch(/auto-track|autoTrack|data-auto-track/);
  });
});
