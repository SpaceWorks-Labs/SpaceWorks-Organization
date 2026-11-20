import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/lib/loginMethods", () => ({ loadLoginMethods: mocks.load }));

import { gateDisabledMethod } from "@/lib/authMethods/gate";

const call = (path: string, headers: Record<string, string> = {}, method = "GET") => gateDisabledMethod(new Request(`https://org.example.test${path}`, { method, headers }));
const state = (available: string[], oidc: { id: string; slug: string }[] = []) => mocks.load.mockResolvedValue({ available, oidc });

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://org.example.test"); });

describe("off means gone for OAuth and OIDC routes", () => {
  it.each(["google", "github", "apple"])("sends %s's start and callback to /login?error=method_disabled while it is off", async (id) => {
    state(["password"]);
    for (const path of [`/api/auth/signin/${id}`, `/api/auth/callback/${id}`]) {
      const response = (await call(path))!;
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("https://org.example.test/login?error=method_disabled");
    }
  });
  it("lets the route through while the method is on", async () => {
    state(["password", "google"]);
    expect(await call("/api/auth/callback/google")).toBeNull();
  });
  it("refuses an OIDC provider whose method is off, that is disabled or that does not exist; allows an enabled one", async () => {
    state(["password"], [{ id: "work", slug: "work" }]);
    expect((await call("/api/auth/callback/oidc-work"))!.status).toBe(302);
    state(["password", "oidc"], [{ id: "work", slug: "work" }]);
    expect((await call("/api/auth/callback/oidc-gone"))!.status).toBe(302);
    expect(await call("/api/auth/callback/oidc-work")).toBeNull();
  });
  it("answers Auth.js's own client with JSON, and leaves other Auth.js routes and credentials ids alone", async () => {
    state(["password"]);
    const json = await (await call("/api/auth/signin/google", { "x-auth-return-redirect": "1" }, "POST"))!.json();
    expect(json.url).toBe("https://org.example.test/login?error=method_disabled");
    expect(await call("/api/auth/session")).toBeNull();
    expect(await call("/api/auth/callback/credentials", {}, "POST")).toBeNull();
    expect(await call("/api/auth/callback/saml", {}, "POST")).toBeNull();
  });
});
