import { describe, expect, it } from "vitest";
import { analyticsTemplate, isBearerUrl, replayRoute, templateForPath } from "@/lib/telemetry/routes";

const url = (path: string) => new URL(path, "https://members.example.test");

describe("telemetry route templates", () => {
  it.each([
    ["/", "/"], ["/about", "/about"], ["/features", "/features"], ["/docs", "/docs"], ["/docs/getting-started", "/docs/:slug"],
    ["/organisations", "/organisations"], ["/o/acme", "/o/:orgSlug"], ["/privacy", "/privacy"], ["/terms", "/terms"],
    ["/about/", "/about"], ["/o/acme-club/join/annual", "/o/:orgSlug/join/:planSlug"],
  ])("reports %s as %s and never the raw path", (path, template) => {
    expect(analyticsTemplate(url(path))).toBe(template);
  });

  it.each([
    "/join/org/abc123token", "/verify/abcdefghijklmnopqrstuv", "/pay/sometoken", "/login", "/reset-password", "/verify-email", "/start",
    "/dashboard", "/dashboard/acme/members", "/account", "/account/pay/term1", "/super-admin", "/super-admin/settings",
    "/api/health", "/o", "/o/", "/docs/a/b", "/o/acme/members", "/o/acme/join", "/unknown", "/o//join/x",
    "/o/ac%20me", "/o/acme/join/a/b",
  ])("fails closed for %s", (path) => {
    expect(analyticsTemplate(url(path))).toBeNull();
    expect(isBearerUrl(url(path))).toBe(true);
  });

  it("drops a URL that carries a query string or a fragment rather than reporting it", () => {
    expect(analyticsTemplate(url("/o/acme?unit=ABC"))).toBeNull();
    expect(analyticsTemplate(url("/about?utm_source=x"))).toBeNull();
    expect(analyticsTemplate(url("/about#team"))).toBeNull();
  });

  it("matches templates on the path alone for the policy", () => {
    expect(templateForPath("/o/acme")).toBe("/o/:orgSlug");
    expect(templateForPath("/dashboard")).toBeNull();
    expect(templateForPath("about")).toBeNull();
    expect(templateForPath("//")).toBeNull();
  });
});

describe("replay routes", () => {
  it("runs Clarity only on /about and /features", () => {
    expect(replayRoute("clarity", "/about")).toBe(true);
    expect(replayRoute("clarity", "/features")).toBe(true);
    expect(replayRoute("clarity", "/")).toBe(false);
    expect(replayRoute("clarity", "/o/:orgSlug")).toBe(false);
  });

  it("runs PostHog replay on the public set but never on the join form or an unknown page", () => {
    for (const template of ["/", "/about", "/features", "/docs", "/docs/:slug", "/organisations", "/o/:orgSlug", "/privacy", "/terms"]) {
      expect(replayRoute("posthog", template)).toBe(true);
    }
    expect(replayRoute("posthog", "/o/:orgSlug/join/:planSlug")).toBe(false);
    expect(replayRoute("posthog", null)).toBe(false);
    expect(replayRoute("none", "/about")).toBe(false);
  });
});
