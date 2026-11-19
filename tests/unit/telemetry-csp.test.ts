import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { pageSecurity } from "@/lib/pageSecurity";

const csp = (path: string) => pageSecurity(new NextRequest(`https://members.example.test${path}`)).headers.get("content-security-policy") ?? "";
const directive = (policy: string, name: string) => policy.split("; ").find((part) => part.startsWith(`${name} `)) ?? "";

afterEach(() => vi.unstubAllEnvs());

describe("page security policy", () => {
  it("keeps the strict default when nothing is configured, with no https: wildcard for connections", () => {
    for (const path of ["/", "/about", "/o/acme", "/login", "/dashboard/acme"]) {
      const policy = csp(path);
      expect(directive(policy, "connect-src"), path).toBe("connect-src 'self'");
      expect(directive(policy, "script-src"), path).toMatch(/^script-src 'self' 'nonce-[^']+' 'strict-dynamic'$/);
      expect(directive(policy, "frame-src"), path).toBe("frame-src 'none'");
    }
  });

  it("widens connect-src and script-src for the allow-list on public template paths only", () => {
    vi.stubEnv("WEB_TELEMETRY_ALLOWED_ORIGINS", "https://umami.example.org,https://www.googletagmanager.com");
    for (const path of ["/", "/about", "/features", "/docs", "/docs/intro", "/organisations", "/o/acme", "/privacy", "/terms", "/o/acme/join/annual"]) {
      expect(directive(csp(path), "connect-src"), path).toContain("https://umami.example.org");
      expect(directive(csp(path), "script-src"), path).toContain("https://www.googletagmanager.com");
    }
    for (const path of ["/login", "/dashboard", "/dashboard/acme/members", "/account", "/account/pay/t1", "/pay/tok", "/verify/abc", "/join/org/tok", "/super-admin/settings", "/start", "/unknown"]) {
      const policy = csp(path);
      expect(policy, path).not.toContain("umami.example.org");
      expect(policy, path).not.toContain("googletagmanager");
    }
  });

  it("ignores allow-list entries that are not bare https origins", () => {
    vi.stubEnv("WEB_TELEMETRY_ALLOWED_ORIGINS", "http://plain.example.org,https://*.wild.example.org,https://path.example.org/x,https://ok.example.org");
    const policy = csp("/about");
    expect(policy).toContain("https://ok.example.org");
    for (const bad of ["plain.example.org", "wild.example.org", "path.example.org"]) expect(policy).not.toContain(bad);
  });

  it("adds the Mixpanel hosts only while the token is set, and only on public paths", () => {
    expect(csp("/about")).not.toContain("mixpanel");
    vi.stubEnv("WEB_TELEMETRY_MIXPANEL_TOKEN", "tok_1");
    expect(directive(csp("/about"), "connect-src")).toContain("https://api.mixpanel.com");
    expect(directive(csp("/about"), "script-src")).toContain("https://cdn.mxpnl.com");
    expect(csp("/dashboard")).not.toContain("mixpanel");
    vi.stubEnv("WEB_TELEMETRY_MIXPANEL_API_HOST", "https://api-eu.mixpanel.com");
    expect(directive(csp("/o/acme"), "connect-src")).toContain("https://api-eu.mixpanel.com");
    vi.stubEnv("WEB_TELEMETRY_MIXPANEL_TOKEN", "");
    expect(csp("/about")).not.toContain("mixpanel");
  });

  it("gives Razorpay Checkout its frame and connections on /account and /pay/ only", () => {
    for (const path of ["/account", "/account/pay/t1", "/pay/sometoken"]) {
      const policy = csp(path);
      expect(directive(policy, "frame-src"), path).toBe("frame-src https://api.razorpay.com https://checkout.razorpay.com");
      expect(directive(policy, "connect-src"), path).toContain("https://lumberjack.razorpay.com");
    }
    for (const path of ["/", "/o/acme", "/dashboard", "/verify/abc", "/payments", "/paying"]) {
      expect(csp(path), path).not.toContain("razorpay");
    }
  });

  it("adds the backend origin when the browser talks to it, and never an invalid one", () => {
    vi.stubEnv("NEXT_PUBLIC_BACKEND_ORIGIN", "https://api.example.org");
    expect(directive(csp("/dashboard"), "connect-src")).toBe("connect-src 'self' https://api.example.org");
    vi.stubEnv("NEXT_PUBLIC_BACKEND_ORIGIN", "http://evil.example.org");
    expect(directive(csp("/dashboard"), "connect-src")).toBe("connect-src 'self'");
  });

  it("keeps framing protection, form-action and the nonce on every page", () => {
    const response = pageSecurity(new NextRequest("https://members.example.test/about"));
    const policy = response.headers.get("content-security-policy") ?? "";
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("form-action 'self'");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });
});

describe("identity bridges", () => {
  const configure = () => {
    vi.stubEnv("AUTH_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("AUTH_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("AUTH_FIREBASE_API_KEY", "AIzaSyExampleKey123");
    vi.stubEnv("AUTH_FIREBASE_AUTH_DOMAIN", "demo-project.firebaseapp.com");
    vi.stubEnv("AUTH_FIREBASE_PROJECT_ID", "demo-project");
  };

  it("adds nothing while no bridge is configured", () => {
    for (const path of ["/login", "/login/bridge/firebase", "/join/org/tok", "/verify-email"]) expect(directive(csp(path), "connect-src"), path).toBe("connect-src 'self'");
  });

  it("widens connect-src and frame-src on the sign-in pages only", () => {
    configure();
    for (const path of ["/login", "/login/bridge/supabase", "/login/bridge/firebase", "/join/org/tok", "/verify-email"]) {
      const policy = csp(path);
      expect(directive(policy, "connect-src"), path).toContain("https://abc.supabase.co");
      expect(directive(policy, "connect-src"), path).toContain("https://identitytoolkit.googleapis.com");
      expect(directive(policy, "connect-src"), path).toContain("https://securetoken.googleapis.com");
      expect(directive(policy, "frame-src"), path).toContain("https://demo-project.firebaseapp.com");
    }
    for (const path of ["/", "/about", "/o/acme", "/verify/abc", "/dashboard", "/account", "/pay/tok", "/super-admin/auth", "/loginx", "/join/org"]) {
      const policy = csp(path);
      expect(policy, path).not.toContain("supabase.co");
      expect(policy, path).not.toContain("googleapis.com");
      expect(policy, path).not.toContain("firebaseapp.com");
    }
  });

  it("leaves out a bridge that LOGIN_METHODS excludes", () => {
    configure();
    vi.stubEnv("LOGIN_METHODS", "password,supabase");
    const policy = csp("/login");
    expect(policy).toContain("https://abc.supabase.co");
    expect(policy).not.toContain("googleapis.com");
    expect(policy).not.toContain("firebaseapp.com");
  });
});
